import { expect, test } from '@playwright/test';
import { bearingDifference, getHashParams, languageSelect, styleSelect, waitForMap } from './helpers';

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
    .toBe('17/34.6937/135.5023');
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
    .toBe('17/34.6937/135.5023');
});

test('fits every result when the search API returns places far apart', async ({ page }) => {
  // beforeEach の 1 件だけの結果より後に登録したルートが先に使われる
  await page.route('https://api.maps.geolonia.com/v1/search?**', (route) => route.fulfill({
    json: {
      geojson: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: '東京駅' }, geometry: { type: 'Point', coordinates: [139.7671, 35.6812] } },
          { type: 'Feature', properties: { name: '大阪駅' }, geometry: { type: 'Point', coordinates: [135.4959, 34.7024] } },
        ],
      },
    },
  }));
  await page.goto('/#map=17/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.getByPlaceholder('検索...').fill('駅');
  await page.getByPlaceholder('検索...').press('Enter');

  await expect.poll(async () => Number((await getHashParams(page)).get('map')?.split('/')[0]), { timeout: SEARCH_MOVE_TIMEOUT })
    .toBeLessThan(10);
  await page.waitForFunction(() => !window._mainMap!.isMoving());
  const contains = await page.evaluate(() => {
    const bounds = window._mainMap!.getBounds();
    return [bounds.contains([139.7671, 35.6812]), bounds.contains([135.4959, 34.7024])];
  });
  expect(contains).toEqual([true, true]);
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

test('switches the API stage with the stage button', async ({ page }) => {
  // dev 環境の状態に左右されないよう、dev の API には実際には問い合わせない
  await page.route('https://api.geolonia.com/dev/**', (route) => route.abort());

  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);
  const stageButton = page.getByRole('button', { name: 'v1' });
  await expect(stageButton).toBeVisible();

  const devRequest = page.waitForRequest((req) => req.url().startsWith('https://api.geolonia.com/dev/'));
  await stageButton.click();

  expect(new URL((await devRequest).url()).pathname).toMatch(/^\/dev\//);
  await expect(page.getByRole('button', { name: 'dev' })).toBeVisible();
  await expect.poll(async () => (await getHashParams(page)).get('stage')).toBe('dev');
});

test('keeps the order of the controls in the top-right corner', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  const classes = await page.locator('.maplibregl-ctrl-top-right button').evaluateAll(
    (buttons) => buttons.map((button) => button.className.split(' ')[0]),
  );
  expect(classes).toEqual([
    'maplibregl-ctrl-fullscreen',
    'maplibregl-ctrl-zoom-in',
    'maplibregl-ctrl-zoom-out',
    'maplibregl-ctrl-compass',
    'maplibregl-ctrl-geolocate',
    'maplibregl-ctrl-circle-flight',
  ]);
});

test('tilts the compass with the camera and resets the pitch when clicked', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.evaluate(() => window._mainMap!.jumpTo({ pitch: 45, bearing: 30 }));
  const icon = page.locator('.maplibregl-ctrl-compass .maplibregl-ctrl-icon');
  await expect.poll(() => icon.evaluate((el) => (el as HTMLElement).style.transform)).toContain('rotateX(45deg)');

  await page.locator('.maplibregl-ctrl-compass').click();
  await expect.poll(() => page.evaluate(() => [window._mainMap!.getPitch(), window._mainMap!.getBearing()]))
    .toEqual([0, 0]);
});

test('keeps the zoom, bearing and pitch after the camera stops', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671&style=geolonia/basic-v2');
  await waitForMap(page);

  await page.evaluate(() => window._mainMap!.jumpTo({ zoom: 14.3, pitch: 45, bearing: 30 }));
  await expect.poll(async () => (await getHashParams(page)).get('map')).toMatch(/^14\.3\/[\d.]+\/[\d.]+\/30\/45$/);
  // 書き換えたハッシュで地図が動かないことを、少し待ってから確かめる
  await page.waitForTimeout(1_000);
  const camera = await page.evaluate(() => {
    const map = window._mainMap!;
    return { zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  });
  expect(camera).toEqual({ zoom: 14.3, bearing: 30, pitch: 45 });
});

test('writes the camera into the URL hash when the page opens without one', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);

  await expect.poll(async () => (await getHashParams(page)).get('map')).toMatch(/^[\d.]+\/[\d.-]+\/[\d.-]+/);
  await styleSelect(page).selectOption('geolonia/gsi');
  await expect.poll(async () => (await getHashParams(page)).get('style')).toBe('geolonia/gsi');
  expect((await getHashParams(page)).get('map')).toMatch(/^[\d.]+\/[\d.-]+\/[\d.-]+/);
});

test('starts and stops the circle flight with its button', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671/0/0&style=geolonia/basic-v2');
  await waitForMap(page);
  const button = page.locator('.maplibregl-ctrl-circle-flight');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAccessibleName('サークル飛行');
  await expect(button).toHaveAttribute('title', 'サークル飛行を開始');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'サークル飛行を停止');
  // 回りながら斜めから見下ろす
  await expect.poll(() => page.evaluate(() => window._mainMap!.getBearing())).toBeGreaterThan(5);
  await expect.poll(() => page.evaluate(() => window._mainMap!.getPitch())).toBeGreaterThan(30);
  const { lng, lat } = await page.evaluate(() => window._mainMap!.getCenter());
  expect(lng).toBeCloseTo(139.7671, 3);
  expect(lat).toBeCloseTo(35.6812, 3);

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  const bearing = await page.evaluate(() => window._mainMap!.getBearing());
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window._mainMap!.getBearing())).toBe(bearing);
});

test('stops the circle flight when the map is dragged', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671/0/60&style=geolonia/basic-v2');
  await waitForMap(page);
  const button = page.locator('.maplibregl-ctrl-circle-flight');
  await button.click();
  await expect.poll(() => page.evaluate(() => window._mainMap!.getBearing())).toBeGreaterThan(1);

  const canvas = page.locator('.maplibregl-canvas');
  const box = (await canvas.boundingBox())!;
  const centerBefore = await page.evaluate(() => window._mainMap!.getCenter());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50, { steps: 5 });
  await page.mouse.up();

  await expect(button).toHaveAttribute('aria-pressed', 'false');
  // 止めたあとも、同じドラッグで地図は動く
  const centerAfter = await page.evaluate(() => window._mainMap!.getCenter());
  expect(centerAfter).not.toEqual(centerBefore);
  const bearing = await page.evaluate(() => window._mainMap!.getBearing());
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window._mainMap!.getBearing())).toBe(bearing);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('still flies in a circle when the OS asks for reduced motion', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/#map=14/35.6812/139.7671/0/60&style=geolonia/basic-v2');
    await waitForMap(page);

    // 押したのは利用者なので、動きを減らす設定でも 1/4 周ずつ飛ばさずに回す。
    // 経過時間に左右されないよう、描画のたびの向きの変化が小さいことを確かめる
    await page.evaluate(() => {
      const map = window._mainMap!;
      const steps: number[] = [];
      let last = map.getBearing();
      map.on('move', () => {
        const bearing = map.getBearing();
        steps.push(Math.abs(((bearing - last) % 360 + 540) % 360 - 180));
        last = bearing;
      });
      window._bearingSteps = steps;
    });
    await page.locator('.maplibregl-ctrl-circle-flight').click();
    await expect(page.locator('.maplibregl-ctrl-circle-flight')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window._bearingSteps!.length)).toBeGreaterThan(10);
    expect(Math.max(...await page.evaluate(() => window._bearingSteps!))).toBeLessThan(10);
    expect(errors).toEqual([]);
  });
});

test('keeps flying and keeps the bearing when the style changes', async ({ page }) => {
  await page.goto('/#map=14/35.6812/139.7671/0/60&style=geolonia/basic-v2');
  await waitForMap(page);
  const button = page.locator('.maplibregl-ctrl-circle-flight');
  await button.click();
  await expect.poll(() => page.evaluate(() => window._mainMap!.getBearing())).toBeGreaterThan(10);

  const before = await page.evaluate(() => window._mainMap!.getBearing());
  await styleSelect(page).selectOption('geolonia/gsi');
  await expect.poll(async () => (await getHashParams(page)).get('style')).toBe('geolonia/gsi');
  await page.waitForTimeout(1_000);

  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // 待つ間に 180 度をまたいでも比べられるよう、差で確かめる
  expect(bearingDifference(await page.evaluate(() => window._mainMap!.getBearing()), before)).toBeGreaterThan(0);
});
