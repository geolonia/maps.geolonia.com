# [maps.geolonia.com](https://maps.geolonia.com)

## 開発

Node.js 22 と Yarn 1 を使います。

```sh
yarn install
yarn start   # 開発サーバー（http://localhost:3000）
yarn test    # ユニットテスト（Vitest）
yarn test:e2e  # E2E テスト（Playwright。先に yarn build と npx playwright install chromium が必要）
yarn lint    # ESLint
yarn build   # 型チェックとビルド（出力先は build/）
```
