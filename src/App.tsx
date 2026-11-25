import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GeoJSONSource, type Map as MaplibreMap } from 'maplibre-gl';
import { Control, FullscreenControl, GeolocateControl, Map, NavigationControl, useControl } from '@geolonia/maps-react';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import Div100vh from 'react-div-100vh';
import { normalize } from '@geolonia/normalize-any-latlng';
import { parseHash, parseTilesetOverrideHash, updateHash } from './lib/hash';
import { resolveLanguage, STANDARD_STYLES, styleIdToUrl } from './lib/style';
import { getCurrentSavedState, getDefaultCameraOptions, type InitialSavedState } from './lib/saved-state';
import { formatCameraHash, formatPosition } from './lib/position';
import { overrideTilesetUrl } from './lib/tileset-override';
import { coordinatesToFeatureCollection } from './lib/coordinates';
import { nextStage, resolveStage } from './lib/stage';
import { CircleFlightControl } from './lib/circle-flight-control';
import { TourControl } from './lib/tour-control';
import { pointBounds } from './lib/bounds';
import { createZoomLimitsUpdater } from './lib/zoom-limits';
import { isRenderer, RENDERERS, resolveRenderer } from './lib/renderer';
import { registerMapTools } from './lib/webmcp';
import MachGLMap from './MachGLMap';

interface SearchFormControlsCollection extends HTMLFormControlsCollection {
  q: HTMLInputElement
}

const createCircleFlightControl = () => new CircleFlightControl();

// useControl は地図の中でしか呼べないので、コントロールごとにコンポーネントにする
const CircleFlightButton: React.FC = () => {
  useControl(createCircleFlightControl, { position: 'top-right' });
  return null;
};

const createTourControl = () => new TourControl();

const TourButton: React.FC = () => {
  useControl(createTourControl, { position: 'top-right' });
  return null;
};

const App: React.FC = () => {
  const [ zLatLngString, setZLatLngString ] = useState<string>('');
  const mapRef = useRef<MaplibreMap>();

  const savedState = useMemo(getCurrentSavedState, []);

  // MapLibre の hash は地図を作った時点でハッシュを書き換えるので、初期位置は地図を作る前に決める
  const initialCamera = useMemo(() => {
    const { center, zoom } = getDefaultCameraOptions(savedState);
    return { center: [center.lng, center.lat] as [number, number], zoom };
  }, [savedState]);

  const setSavedState = useCallback((input: Partial<InitialSavedState>) => {
    const currentState = getCurrentSavedState();
    const newState: InitialSavedState = {...currentState, ...input};
    const rawState = JSON.stringify(newState);
    try {
      window.localStorage.setItem('geolstate', rawState);
    } catch {
      // no-op
    }
  }, []);

  const defaultStyleFromHash = useMemo(() => {
    return parseHash().get('style') || savedState.style;
  }, [savedState.style]);

  const defaultLanguageFromHash = useMemo(() => {
    return parseHash().get('lang') || savedState.lang;
  }, [savedState.lang]);

  const [ style, setStyle ] = useState<string>(defaultStyleFromHash);
  const [ language, setLanguage ] = useState<string>(defaultLanguageFromHash);
  const currentStyleUrl = styleIdToUrl(style, language);

  const onLoad = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
    (window as any)._mainMap = map;

    map.on('moveend', () => {
      const rawZoom = map.getZoom();
      const { zLatLng, lat, lng } = formatPosition(map.getCenter(), rawZoom);
      setZLatLngString(zLatLng);
      setSavedState({ z: rawZoom, lat, lng });
    });

    const updateZoomLimits = createZoomLimitsUpdater(map);
    map.on('styledata', () => {
      // style has changed, see if there's any metadata we need to read
      updateZoomLimits(map.getStyle().metadata || {});
    });
  }, [setSavedState]);

  // maps-core が API キーなどを付けた後の URL が渡される
  const transformRequest = useCallback((url: string) => {
    const replaceMap = parseTilesetOverrideHash();
    return { url: overrideTilesetUrl(url, replaceMap) };
  }, []);

  const changeStyle = useCallback((val: string) => {
    setStyle(val);
    setSavedState({ style: val });
  }, [setSavedState]);

  const onMapStyleChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    changeStyle(ev.target.value);
  }, [changeStyle]);

  const onMapLanguageChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    setLanguage(val);
    setSavedState({ lang: val });
  }, [setSavedState]);

  useEffect(() => {
    const hash = parseHash();
    // map は MapLibre の hash が向きと傾きを含めて書くので、ここでは書かない
    hash.set('style', style);
    if (language && language !== 'auto') {
      hash.set('lang', language);
    } else {
      hash.delete('lang');
    }

    updateHash(hash);
  }, [ style, language ]);

  const handleSearch = useCallback<React.FormEventHandler<HTMLFormElement>>(async (ev) => {
    ev.preventDefault();

    const elements = ev.currentTarget.elements as SearchFormControlsCollection;
    const query = elements.q.value;

    const map = mapRef.current;
    if (!map) {
      return;
    }

    let data: FeatureCollection<Geometry, GeoJsonProperties>;
    const queriesInCoord = normalize(query).filter((coord) => coord.lat !== null && coord.lng !== null);

    if (queriesInCoord.length > 0) {
      data = coordinatesToFeatureCollection(queriesInCoord as { lat: number, lng: number }[]);
    } else {
      const qsa = new URLSearchParams();
      qsa.set('q', query);
      const {lng, lat} = map.getCenter();
      qsa.set('pos', `${lng},${lat}`);
      const resp = await fetch(
        `https://api.maps.geolonia.com/v1/search?${qsa.toString()}`, {
          method: 'get',
        },
      );
      const body = await resp.json();
      if (body.error === true) {
        // eslint-disable-next-line no-console
        console.error(body);
        return;
      }

      data = body.geojson as FeatureCollection<Geometry, GeoJsonProperties>;
    }

    const source = map.getSource('search-results');
    if (source) {
      if (source.type !== 'geojson') return;
      const geoJsonSource = source as GeoJSONSource;
      geoJsonSource.setData(data);
    } else {
      map.addSource('search-results', {
        type: 'geojson',
        data,
      });
    }

    if (!map.getLayer('search-results-circle')) {
      const textColor = '#000000';
      const textHaloColor = '#FFFFFF';
      const backgroundColor = 'rgba(255, 0, 0, 0.4)';
      const strokeColor = '#FFFFFF';

      map.addLayer({
        id: 'search-results-circle',
        type: 'circle',
        source: 'search-results',
        paint: {
          'circle-radius': 13,
          'circle-color': ['string', ['get', 'marker-color'], backgroundColor],
          'circle-opacity': ['number', ['get', 'fill-opacity'], 1.0],
          'circle-stroke-width': ['number', ['get', 'stroke-width'], 1],
          'circle-stroke-color': ['string', ['get', 'stroke'], strokeColor],
          'circle-stroke-opacity': ['number', ['get', 'stroke-opacity'], 1.0],
        },
      });

      map.addLayer({
        id: 'search-results-symbol',
        type: 'symbol',
        source: 'search-results',
        layout: {
          'text-field': ['get', 'index'],
          'text-size': 14,
          'text-font': ['Noto Sans Regular'],
          'text-allow-overlap': true,
        },
      });

      map.addLayer({
        id: 'search-results-label',
        type: 'symbol',
        source: 'search-results',
        paint: {
          'text-color': ['string', ['get', 'text-color'], textColor],
          'text-halo-color': ['string', ['get', 'text-halo-color'], textHaloColor],
          'text-halo-width': 1,
        },
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-offset': [
            'case',
            ['==', 'small', ['get', 'marker-size']], ['literal', [0, 0.6]],
            ['==', 'large', ['get', 'marker-size']], ['literal', [0, 1.2]],
            ['literal', [0, 0.8]],
          ],
          'text-allow-overlap': false,
        },
      });
    }

    const bounds = pointBounds(data);
    if (typeof bounds !== 'undefined') {
      // 結果が 1 件だと範囲の大きさが 0 になり、上限まで寄ってしまうので、街区が見える程度で止める
      map.fitBounds(bounds, { padding: 200, maxZoom: 17 });
    }
  }, []);

  const stage = useMemo(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem('_geoloniaStageOverride');
    } catch {
      // no-op
    }
    return resolveStage(parseHash().get('stage'), stored);
  }, []);

  // 読み込み直した後も同じ位置から始める。MapLibre も MachGL も moveend の後に間引いてハッシュの map= を書くので、カメラが動いている間は今の位置と限らない
  const reloadWithHashParam = useCallback((key: string, value: string) => {
    const hashParams = parseHash();
    hashParams.set(key, value);
    if (mapRef.current) {
      hashParams.set('map', formatCameraHash(mapRef.current));
    }
    updateHash(hashParams);
    document.location.reload();
  }, []);

  const handleStageChange = useCallback<React.MouseEventHandler<HTMLButtonElement>>((ev) => {
    ev.preventDefault();
    const newStage = nextStage(stage);
    try {
      window.localStorage.setItem('_geoloniaStageOverride', newStage);
    } catch {
      // no-op
    }
    reloadWithHashParam('stage', newStage);
  }, [stage, reloadWithHashParam]);

  const renderer = useMemo(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem('_geoloniaRenderer');
    } catch {
      // no-op
    }
    return resolveRenderer(parseHash().get('renderer'), stored);
  }, []);

  // 地図ライブラリごと入れ替えるので、stage と同じく読み込み直す。位置はハッシュの map= で引き継ぐ
  const handleRendererChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>((ev) => {
    const newRenderer = ev.target.value;
    if (!isRenderer(newRenderer) || newRenderer === renderer) return;
    try {
      window.localStorage.setItem('_geoloniaRenderer', newRenderer);
    } catch {
      // no-op
    }
    reloadWithHashParam('renderer', newRenderer);
  }, [renderer, reloadWithHashParam]);

  // WebMCP（実験）。対応するブラウザでだけ、地図の操作をエージェントに公開する。ツールは使われる時点の値を読むので、ref 越しに渡す
  const webMcpStateRef = useRef({ style, language, renderer });
  webMcpStateRef.current = { style, language, renderer };
  useEffect(() => registerMapTools(document, {
    getMap: () => mapRef.current,
    getStyle: () => webMcpStateRef.current.style,
    setStyle: changeStyle,
    getLanguage: () => webMcpStateRef.current.language,
    getRenderer: () => webMcpStateRef.current.renderer,
  }), [changeStyle]);

  const settingsPanel = (
    <div className="settings-panel">
      {/* WebMCP のツールからも変わるので、表示は state に合わせる */}
      <select
        onChange={onMapStyleChange}
        value={style}
      >
        <optgroup label="標準スタイル">
          {STANDARD_STYLES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </optgroup>
        <optgroup label="SmartCity用スタイル">
          <option value="geoloniamaps/smartcity-base">SmartCity Base</option>
        </optgroup>
        <optgroup label="その他">
          <option value="https://raw.githubusercontent.com/geolonia/butter/main/style.json">Butter</option>
          <option value="https://geolonia.github.io/openstreetmap-carto/style.json">OSM Carto</option>
        </optgroup>
        <optgroup label="EXPERIMENTAL | 実験的">
          <option value="https://raw.githubusercontent.com/geolonia/basic-gsiseamlessphoto/main/style.json">Basic &amp; GSI Seamless Photo</option>
        </optgroup>
      </select>
      <select
        onChange={onMapLanguageChange}
        value={language}
      >
        <option value="auto">Auto / 自動判定</option>
        <option value="ja">日本語</option>
        <option value="en">English</option>
      </select>
      <div role="radiogroup" aria-label="地図の描画ライブラリ" className="renderer-switch">
        {RENDERERS.map(({ value, label }) => (
          <label key={value}>
            <input
              type="radio"
              name="renderer"
              value={value}
              checked={renderer === value}
              onChange={handleRendererChange}
            />
            {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="stage-switch"
        onClick={handleStageChange}
      >
        {stage}
      </button>
      <a
        href={`https://openstreetmap.org/#map=${zLatLngString}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ext openstreetmap-link"
      >
        OpenStreetMap で開く
      </a>
    </div>
  );

  const searchPanel = (
    <form id="searchControl" onSubmit={handleSearch}>
      <input
        type="search"
        placeholder="検索..."
        name="q"
      />
    </form>
  );

  if (renderer === 'mach-gl') {
    return (
      <Div100vh>
        <MachGLMap
          style={styleIdToUrl(style, resolveLanguage(language, navigator.languages, navigator.language))}
          lang={language}
          stage={stage}
          center={initialCamera.center}
          zoom={initialCamera.zoom}
          transformRequest={transformRequest}
          onLoad={onLoad}
        >
          {settingsPanel}
          <div style={{ marginTop: '10px' }}>{searchPanel}</div>
        </MachGLMap>
      </Div100vh>
    );
  }

  return (
    <>
      <Div100vh>
        <Map
          containerStyle={{ width: '100vw', height: '100%' }}
          apiKey="YOUR-API-KEY"
          stage={stage}
          hash="map"
          center={initialCamera.center}
          zoom={initialCamera.zoom}
          transitionType="jump"
          style={currentStyleUrl}
          transformRequest={transformRequest}
          // maps-core の 🧭 は傾きを表示しないので、右上のコントロールは maps-react で同じ順に置く
          navigationControl={false}
          gestureHandling={false}
          marker={false}
          // '3d' は数字で始まり JSX の属性名に書けないので、spread で渡す
          {...{ '3d': true }}
          scaleControl="bottom-right"
          onLoad={onLoad}
        >
          <FullscreenControl />
          <NavigationControl visualizePitch />
          <GeolocateControl />
          <CircleFlightButton />
          <TourButton />
          <Control position="top-left">
            {settingsPanel}
          </Control>
          <Control position="top-left">
            {searchPanel}
          </Control>
        </Map>
      </Div100vh>
    </>
  );
};

export default App;
