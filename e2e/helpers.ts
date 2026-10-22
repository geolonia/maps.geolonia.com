import type { Page } from '@playwright/test';

type MapLike = {
  loaded: () => boolean
  isStyleLoaded: () => boolean
  getCenter: () => { lng: number, lat: number }
  getZoom: () => number
  getSource: (id: string) => unknown
  getLayer: (id: string) => unknown
  getStyle: () => { name?: string } | undefined
  jumpTo: (options: { center?: [number, number], zoom?: number, pitch?: number, bearing?: number }) => void
  getPitch: () => number
  getBearing: () => number
};

declare global {
  interface Window {
    _mainMap?: MapLike
  }
}

// スタイルとタイルの読み込みが終わるまで待つ
export const waitForMap = async (page: Page) => {
  await page.waitForFunction(
    () => window._mainMap?.isStyleLoaded() === true && window._mainMap.loaded(),
    undefined,
    { timeout: 30_000 },
  );
};

export const getHashParams = async (page: Page) => {
  const hash = await page.evaluate(() => window.location.hash);
  return new URLSearchParams(hash.substring(1));
};

// 並び順に頼らず、持っている選択肢でセレクトボックスを特定する
export const styleSelect = (page: Page) => page.locator('select', { has: page.locator('option[value="geolonia/gsi"]') });
export const languageSelect = (page: Page) => page.locator('select', { has: page.locator('option[value="en"]') });
