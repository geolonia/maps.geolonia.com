import { expect, test } from '@playwright/test';
import { getHashParams, languageSelect, styleSelect, waitForMap } from './helpers';

// 検索後の移動はアニメーションとタイルの読み込みを待つので、長めに待つ
const SEARCH_MOVE_TIMEOUT = 40_000;

test.beforeEach(async ({ page }) => {
  // 外部の地名検索 API は E2E では呼ばない
  await page.route('https://api.maps.geolonia.com/v1/search?**', (route) => route.fulfill({
    json: {
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: '大阪市役所' },
            geometry: { type: 'Point', coordinates: [135.5023, 34.6937] },
          },
        ],
      },
    },
  }));
});

test('shows the map at the position in the URL hash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(styleSelect(page)).toHaveValue('geolonia/basic-v2');
  await expect(page.getByPlaceholder('検索...')).toBeVisible();

  const { lng, lat, zoom } = await page.evaluate(() => {
    const map = window._mainMap!;
    return { ...map.getCenter(), zoom: map.getZoom() };
  });
  expect(lng).toBeCloseTo(139.7671, 3);
  expect(lat).toBeCloseTo(35.6812, 3);
  expect(zoom).toBeCloseTo(14, 1);
  expect(errors).toEqual([]);
});

test('switches the style and writes it to the URL hash', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);
  expect(await page.evaluate(() => window._mainMap!.getStyle()?.name)).toMatch(/Basic v2/);

  await styleSelect(page).selectOption('geolonia/gsi');

  await expect.poll(() => page.evaluate(() => window._mainMap!.getStyle()?.name)).toMatch(/GSI/);
  await expect.poll(async () => (await getHashParams(page)).get('style')).toBe('geolonia/gsi');
});

test('requests the style in the selected language', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const styleRequest = page.waitForRequest((req) => new URL(req.url()).pathname === '/style/geolonia/basic-v2/en.json');
  await languageSelect(page).selectOption('en');
  await styleRequest;

  await expect.poll(async () => (await getHashParams(page)).get('lang')).toBe('en');
});

test('moves to the coordinates typed in the search box', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.getByPlaceholder('検索...').fill('34.6937, 135.5023');
  await page.getByPlaceholder('検索...').press('Enter');

  await expect.poll(async () => (await getHashParams(page)).get('map'), { timeout: SEARCH_MOVE_TIMEOUT })
    .toBe('22/34.6937/135.5023');
  const layers = await page.evaluate(() => ['search-results-circle', 'search-results-symbol', 'search-results-label']
    .map((id) => Boolean(window._mainMap!.getLayer(id))));
  expect(layers).toEqual([true, true, true]);
});

test('moves to the place returned by the search API', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const searchRequest = page.waitForRequest((req) => req.url().startsWith('https://api.maps.geolonia.com/v1/search?'));
  await page.getByPlaceholder('検索...').fill('大阪市役所');
  await page.getByPlaceholder('検索...').press('Enter');

  const url = new URL((await searchRequest).url());
  expect(url.searchParams.get('q')).toBe('大阪市役所');
  await expect.poll(async () => (await getHashParams(page)).get('map'), { timeout: SEARCH_MOVE_TIMEOUT })
    .toBe('22/34.6937/135.5023');
});

test('restores the last position from localStorage when the hash has none', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.evaluate(() => window._mainMap!.jumpTo({ center: [135.5023, 34.6937], zoom: 10 }));
  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('10/34.6937/135.5023');

  await page.goto('/');
  await waitForMap(page);
  const { lng, lat, zoom } = await page.evaluate(() => {
    const map = window._mainMap!;
    return { ...map.getCenter(), zoom: map.getZoom() };
  });
  expect(lng).toBeCloseTo(135.5023, 3);
  expect(lat).toBeCloseTo(34.6937, 3);
  expect(zoom).toBeCloseTo(10, 1);
});

test('replaces the tileset ID given in tilesetOverride', async ({ page }) => {
  // CDN のスタイルの中身に左右されないよう、tileserver.geolonia.com のソースを 1 つだけ持つスタイルを返す
  await page.route('https://cdn.geolonia.com/style/geolonia/basic-v2/*.json', (route) => route.fulfill({
    json: {
      version: 8,
      name: 'tilesetOverride fixture',
      sources: {
        fixture: { type: 'vector', url: 'https://tileserver.geolonia.com/e2e-original/tiles.json' },
      },
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } }],
    },
  }));
  await page.route('https://tileserver.geolonia.com/e2e-*/**', (route) => route.abort());

  const tilesetRequest = page.waitForRequest((req) => req.url().startsWith('https://tileserver.geolonia.com/e2e-'));
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2&tilesetOverride=e2e-original:e2e-replaced');

  expect(new URL((await tilesetRequest).url()).pathname).toBe('/e2e-replaced/tiles.json');
});
