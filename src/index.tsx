import React from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@geolonia/maps-core/css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// MapLibre GL JS v6 は worker を URL から読み込むので、最初の地図を作る前に指定する
setWorkerUrl(workerUrl);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}
const root = createRoot(container);
root.render((
  <React.StrictMode>
    <App />
  </React.StrictMode>
));

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
