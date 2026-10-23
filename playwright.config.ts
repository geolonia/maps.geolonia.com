import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 地図の待ち合わせ（最大 30 秒）と検索後の移動（最大 40 秒）が続いても収まる長さにする
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  // テストはそれぞれ新しいブラウザで開き、互いに依存しないので、同じファイルの中でも並べて走らせる。
  // 地図はソフトウェアの WebGL で描くので CPU を多く使う。4 コアのランナーでも 4 並列では描画が詰まって遅くなり、2 並列が最も速かった
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'yarn preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
