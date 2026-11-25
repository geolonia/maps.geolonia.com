import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Map as MaplibreMap } from 'maplibre-gl';
import { Control, FullscreenControl, GeolocateControl, Map, NavigationControl, useControl } from '@geolonia/maps-react';
import Div100vh from 'react-div-100vh';
import { parseHash, parseTilesetOverrideHash, updateHash } from './lib/hash';
import { resolveLanguage, STYLE_GROUPS, styleIdToUrl } from './lib/style';
import { getCurrentSavedState, getDefaultCameraOptions, type InitialSavedState } from './lib/saved-state';
import { formatCameraHash, formatPosition } from './lib/position';
import { overrideTilesetUrl } from './lib/tileset-override';
import { nextStage, resolveStage } from './lib/stage';
import { CircleFlightControl } from './lib/circle-flight-control';
import { TourControl } from './lib/tour-control';
import { searchPlaces, type SearchMap } from './lib/search';
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

    try {
      await searchPlaces(map as unknown as SearchMap, query);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
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
  useEffect(() => {
    webMcpStateRef.current = { style, language, renderer };
  }, [style, language, renderer]);
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
        {STYLE_GROUPS.map(({ label, styles }) => (
          <optgroup key={label} label={label}>
            {styles.map(({ value, label: styleLabel }) => (
              <option key={value} value={value}>{styleLabel}</option>
            ))}
          </optgroup>
        ))}
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
