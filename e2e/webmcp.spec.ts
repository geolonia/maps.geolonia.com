import { expect, test, type Page } from '@playwright/test';
import { getHashParams, styleSelect, waitForMap } from './helpers';

type FakeTool = { execute: (input: Record<string, unknown>) => Promise<string> };

declare global {
  interface Window {
    _webmcpTools?: Map<string, FakeTool>
  }
}

// Playwright の Chromium にはまだ WebMCP が無いので、document.modelContext の代わりに registerTool を受けるだけの入れ物を置く
const installFakeModelContext = (page: Page) => page.addInitScript(() => {
  const tools = new Map<string, FakeTool>();
  window._webmcpTools = tools;
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: (tool: FakeTool & { name: string }, options?: { signal?: AbortSignal }) => {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name));
      },
    },
  });
});

const callTool = (page: Page, name: string, input: Record<string, unknown> = {}) => page.evaluate(
  ([toolName, toolInput]) => window._webmcpTools!.get(toolName as string)!.execute(toolInput as Record<string, unknown>),
  [name, input],
);

// 外部の地名検索 API は E2E では呼ばない
test.beforeEach(async ({ page }) => {
  await page.route('https://api.maps.geolonia.com/v1/search?**', (route) => route.fulfill({
    json: {
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { name: '大阪市役所' }, geometry: { type: 'Point', coordinates: [135.5023, 34.6937] } }],
      },
    },
  }));
});

test('registers the map tools when the browser supports WebMCP', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await expect.poll(() => page.evaluate(() => [...window._webmcpTools!.keys()].sort()))
    .toEqual(['circle_flight', 'get_map_state', 'landmark_tour', 'list_map_styles', 'move_map', 'search_places', 'set_map_style']);
});

test('does not break the page when the browser has no WebMCP', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  expect(await page.evaluate(() => 'modelContext' in document)).toBe(false);
  expect(errors).toEqual([]);
});

test('reports the state of the map', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const state = JSON.parse(await callTool(page, 'get_map_state'));

  expect(state).toMatchObject({
    center: { lat: 35.6812, lng: 139.7671 },
    zoom: 14,
    style: 'geolonia/basic-v2',
    renderer: 'maplibre',
  });
});

test('flies with move_map and returns only after it has arrived', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const result = await callTool(page, 'move_map', { lat: 34.6937, lng: 135.5023, zoom: 16, duration: 1500 });

  // 返った時点でもう着いている。待たずにそのまま読んで確かめる
  const { lng, lat, zoom, moving } = await page.evaluate(() => ({ ...window._mainMap!.getCenter(), zoom: window._mainMap!.getZoom(), moving: window._mainMap!.isMoving() }));
  expect(moving).toBe(false);
  expect(lng).toBeCloseTo(135.5023, 4);
  expect(lat).toBeCloseTo(34.6937, 4);
  expect(zoom).toBeCloseTo(16, 1);
  expect(JSON.parse(result.slice(result.indexOf('{')))).toMatchObject({ center: { lat: 34.6937, lng: 135.5023 }, zoom: 16 });
  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('16/34.6937/135.5023');
});

test('jumps with move_map when asked to', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await callTool(page, 'move_map', { lat: 34.6937, lng: 135.5023, zoom: 16, animation: 'jump' });

  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('16/34.6937/135.5023');
});

test('lists the styles of the settings panel', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/gsi');
  await waitForMap(page);

  const { current, groups } = JSON.parse(await callTool(page, 'list_map_styles'));
  const ids = groups.flatMap((g: { styles: { id: string }[] }) => g.styles.map((s) => s.id));
  const options = await styleSelect(page).locator('option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));

  expect(current).toBe('geolonia/gsi');
  expect(ids).toEqual(options);
});

test('searches with search_places, shows the results and moves to them', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const result = JSON.parse(await callTool(page, 'search_places', { query: '大阪市役所' }));

  expect(result.results).toEqual([{ name: '大阪市役所', lat: 34.6937, lng: 135.5023 }]);
  expect(await page.evaluate(() => window._mainMap!.isMoving())).toBe(false);
  expect(result.state.center.lng).toBeCloseTo(135.5023, 3);
  const layers = await page.evaluate(() => ['search-results-circle', 'search-results-symbol', 'search-results-label']
    .map((id) => Boolean(window._mainMap!.getLayer(id))));
  expect(layers).toEqual([true, true, true]);
});

test('starts and stops the circle flight like its button does', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671/0/0&style=geolonia/basic-v2');
  await waitForMap(page);
  const button = page.locator('.maplibregl-ctrl-circle-flight');

  await callTool(page, 'circle_flight', { action: 'start' });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window._mainMap!.getBearing())).toBeGreaterThan(5);
  expect(JSON.parse(await callTool(page, 'get_map_state')).circleFlight).toBe(true);

  await callTool(page, 'circle_flight', { action: 'stop' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  const bearing = await page.evaluate(() => window._mainMap!.getBearing());
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window._mainMap!.getBearing())).toBe(bearing);
});

test('starts and stops the tour like its button does', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);
  const button = page.locator('.maplibregl-ctrl-tour');

  await callTool(page, 'landmark_tour', { action: 'start' });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse(await callTool(page, 'get_map_state')).landmarkTour).toBe(true);

  await callTool(page, 'landmark_tour', { action: 'stop' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('stops the circle flight when move_map moves the camera, and the button follows', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671/0/0&style=geolonia/basic-v2');
  await waitForMap(page);
  await callTool(page, 'circle_flight', { action: 'start' });

  await callTool(page, 'move_map', { lat: 34.6937, lng: 135.5023, animation: 'ease', duration: 500 });

  await expect(page.locator('.maplibregl-ctrl-circle-flight')).toHaveAttribute('aria-pressed', 'false');
  const state = JSON.parse(await callTool(page, 'get_map_state'));
  expect(state.circleFlight).toBe(false);
  expect(state.center.lng).toBeCloseTo(135.5023, 3);
});

test('switches the style with set_map_style and keeps the select and the URL hash in step', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await callTool(page, 'set_map_style', { style: 'geolonia/gsi' });

  await expect.poll(() => page.evaluate(() => window._mainMap!.getStyle()?.name)).toMatch(/GSI/);
  await expect(styleSelect(page)).toHaveValue('geolonia/gsi');
  await expect.poll(async () => (await getHashParams(page)).get('style')).toBe('geolonia/gsi');
});

test('refuses a style that is not offered, with a reason the model can read', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  expect(await callTool(page, 'set_map_style', { style: 'https://example.com/style.json' })).toMatch(/^エラー: style は/);
  await expect(styleSelect(page)).toHaveValue('geolonia/basic-v2');
});
