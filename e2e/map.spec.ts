import { expect, test } from '@playwright/test';
import { getHashParams, waitForMap } from './helpers';

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
  await expect(page.locator('select').first()).toHaveValue('geolonia/basic-v2');
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

  const styleRequest = page.waitForRequest((req) => req.url().startsWith('https://cdn.geolonia.com/style/geolonia/gsi/'));
  await page.locator('select').first().selectOption('geolonia/gsi');
  await styleRequest;

  await expect.poll(async () => (await getHashParams(page)).get('style')).toBe('geolonia/gsi');
});

test('requests the style in the selected language', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const styleRequest = page.waitForRequest('https://cdn.geolonia.com/style/geolonia/basic-v2/en.json');
  await page.locator('select').nth(1).selectOption('en');
  await styleRequest;

  await expect.poll(async () => (await getHashParams(page)).get('lang')).toBe('en');
});

test('moves to the coordinates typed in the search box', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.getByPlaceholder('検索...').fill('34.6937, 135.5023');
  await page.getByPlaceholder('検索...').press('Enter');

  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('22/34.6937/135.5023');
  const hasResults = await page.evaluate(() => Boolean(window._mainMap!.getSource('search-results')));
  expect(hasResults).toBe(true);
});

test('moves to the place returned by the search API', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const searchRequest = page.waitForRequest((req) => req.url().startsWith('https://api.maps.geolonia.com/v1/search?'));
  await page.getByPlaceholder('検索...').fill('大阪市役所');
  await page.getByPlaceholder('検索...').press('Enter');

  const url = new URL((await searchRequest).url());
  expect(url.searchParams.get('q')).toBe('大阪市役所');
  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('22/34.6937/135.5023');
});

test('restores the last position from localStorage when the hash has none', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.evaluate(() => {
    (window._mainMap as unknown as { jumpTo: (o: object) => void }).jumpTo({ center: [135.5023, 34.6937], zoom: 10 });
  });
  await expect.poll(async () => (await getHashParams(page)).get('map')).toBe('10/34.6937/135.5023');

  await page.goto('/');
  await waitForMap(page);
  const { lng, lat } = await page.evaluate(() => window._mainMap!.getCenter());
  expect(lng).toBeCloseTo(135.5023, 3);
  expect(lat).toBeCloseTo(34.6937, 3);
});

test('replaces the tileset ID given in tilesetOverride', async ({ page }) => {
  const overridden = page.waitForRequest((req) => req.url().startsWith('https://tileserver.geolonia.com/gsi-dem-e2e-override/'));
  await page.route('https://tileserver.geolonia.com/gsi-dem-e2e-override/**', (route) => route.abort());

  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2&tilesetOverride=gsi-dem:gsi-dem-e2e-override');
  await overridden;
});
