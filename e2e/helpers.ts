import type { Page } from '@playwright/test';

type MapLike = {
  loaded: () => boolean
  getCenter: () => { lng: number, lat: number }
  getZoom: () => number
  getSource: (id: string) => unknown
};

declare global {
  interface Window {
    _mainMap?: MapLike
  }
}

// 地図の読み込みが終わり、タイルの読み込みも落ち着くまで待つ
export const waitForMap = async (page: Page) => {
  await page.waitForFunction(() => window._mainMap?.loaded() === true, undefined, { timeout: 30_000 });
};

export const getHashParams = async (page: Page) => {
  const hash = await page.evaluate(() => window.location.hash);
  return new URLSearchParams(hash.substring(1));
};
