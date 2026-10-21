import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // CRA の browserslist（>0.2%, not dead, not op_mini all）で最も古かった Chrome 109 まで含める
    target: ['chrome109', 'edge111', 'firefox114', 'safari16.4'],
    outDir: 'build',
    assetsDir: 'static',
  },
  server: {
    port: 3000,
  },
});
