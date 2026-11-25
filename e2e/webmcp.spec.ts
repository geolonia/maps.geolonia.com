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

test('registers the map tools when the browser supports WebMCP', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await expect.poll(() => page.evaluate(() => [...window._webmcpTools!.keys()].sort()))
    .toEqual(['get_map_state', 'move_map', 'set_map_style']);
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

test('moves the map with move_map', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await callTool(page, 'move_map', { lat: 34.6937, lng: 135.5023, zoom: 16 });

  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('16/34.6937/135.5023');
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

test('refuses a style that is not offered', async ({ page }) => {
  await installFakeModelContext(page);
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await expect(callTool(page, 'set_map_style', { style: 'https://example.com/style.json' })).rejects.toThrow('style');
  await expect(styleSelect(page)).toHaveValue('geolonia/basic-v2');
});
