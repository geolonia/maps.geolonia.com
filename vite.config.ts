import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // CRA の browserslist（>0.2%, not dead, not op_mini all）で最も古かった Chrome 109 まで含める
    target: ['chrome109', 'edge111', 'firefox114', 'safari16.4'],
    outDir: 'build',
    assetsDir: 'static',
    // maplibre-gl は単体で約 1.1 MB あり分割できないので、アプリのコードと別のチャンクにして上限をそれに合わせる
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre-gl', test: /node_modules[\\/]maplibre-gl[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
