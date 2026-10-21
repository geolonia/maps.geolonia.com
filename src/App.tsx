import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, type GeoJSONSource, type Map as MaplibreMap, type RequestTransformFunction } from 'maplibre-gl';
import { Control, Map } from '@geolonia/maps-react';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import Div100vh from 'react-div-100vh';
import { normalize } from '@geolonia/normalize-any-latlng';
import { parseHash, parseTilesetOverrideHash, updateHash } from './lib/hash';
import { styleIdToUrl } from './lib/style';
import { getCurrentSavedState, getDefaultCameraOptions, type InitialSavedState } from './lib/saved-state';
import { formatPosition } from './lib/position';
import { overrideTilesetUrl } from './lib/tileset-override';
import { coordinatesToFeatureCollection } from './lib/coordinates';
import { nextStage, resolveStage } from './lib/stage';

interface SearchFormControlsCollection extends HTMLFormControlsCollection {
  q: HTMLInputElement
}

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

    map.on('styledata', () => {
      // style has changed, see if there's any metadata we need to read
      const styleMetadata: {
        'geolonia:maxzoom'?: number
        'geolonia:minzoom'?: number
      } = map.getStyle().metadata || {};
      const maxzoom = styleMetadata['geolonia:maxzoom'];
      if (maxzoom) {
        map.setMaxZoom(maxzoom);
      } else {
        map.setMaxZoom();
      }
      const minzoom = styleMetadata['geolonia:minzoom'];
      if (minzoom) {
        map.setMinZoom(minzoom);
      } else {
        map.setMinZoom();
      }
    });
  }, [setSavedState]);

  // maps-core が API キーなどを付けた後の URL が渡される
  const transformRequest = useCallback<RequestTransformFunction>((url) => {
    const replaceMap = parseTilesetOverrideHash();
    return { url: overrideTilesetUrl(url, replaceMap) };
  }, []);

  const onMapStyleChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    setStyle(val);
    setSavedState({ style: val });
  }, [setSavedState]);

  const onMapLanguageChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    setLanguage(val);
    setSavedState({ lang: val });
  }, [setSavedState]);

  useEffect(() => {
    const hash = parseHash();
    hash.set('style', style);
    if (zLatLngString) {
      hash.set('map', zLatLngString);
    }
    if (language && language !== 'auto') {
      hash.set('lang', language);
    } else {
      hash.delete('lang');
    }

    updateHash(hash);
  }, [ style, language, zLatLngString ]);

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

    let bounds: LngLatBounds | undefined;
    for (const f of data.features) {
      if (f.geometry.type !== 'Point') continue;
      if (typeof bounds === 'undefined') {
        bounds = new LngLatBounds(f.geometry.coordinates as [number, number], f.geometry.coordinates as [number, number]);
      } else {
        bounds.extend(f.geometry.coordinates as [number, number]);
      }
    }
    if (typeof bounds !== 'undefined') {
      map.fitBounds(bounds, { padding: 200 });
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

  const handleStageChange = useCallback<React.MouseEventHandler<HTMLButtonElement>>((ev) => {
    ev.preventDefault();
    const newStage = nextStage(stage);
    try {
      window.localStorage.setItem('_geoloniaStageOverride', newStage);
    } catch {
      // no-op
    }
    const hashParams = parseHash();
    hashParams.set('stage', newStage);
    updateHash(hashParams);
    document.location.reload();
  }, [stage]);

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
          fullscreenControl
          geolocateControl
          gestureHandling={false}
          marker={false}
          // '3d' は数字で始まり JSX の属性名に書けないので、spread で渡す
          {...{ '3d': true }}
          scaleControl="bottom-right"
          onLoad={onLoad}
        >
          <Control position="top-left">
            <select
              onChange={onMapStyleChange}
              defaultValue={defaultStyleFromHash}
              style={{ marginRight: '10px' }}
            >
              <optgroup label="標準スタイル">
                <option value="geolonia/basic-v2">Basic v2</option>
                <option value="geolonia/gsi">GSI</option>
                <option value="geolonia/homework">Homework</option>
                <option value="geolonia/midnight">Midnight</option>
                <option value="geolonia/notebook">Notebook</option>
                <option value="geolonia/red-planet">Red Planet</option>
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
              defaultValue={defaultLanguageFromHash}
              style={{ marginRight: '10px' }}
            >
              <option value="auto">Auto / 自動判定</option>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
            <a
              href={`https://openstreetmap.org/#map=${zLatLngString}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ext openstreetmap-link"
              style={{ marginRight: '10px' }}
            >
              OpenStreetMap で開く
            </a>
            <button
              style={{}}
              type="button"
              onClick={handleStageChange}
            >
              {stage}
            </button>
          </Control>
          <Control position="top-left">
            <form id="searchControl" onSubmit={handleSearch}>
              <input
                type="search"
                placeholder="検索..."
                name="q"
              />
            </form>
          </Control>
        </Map>
      </Div100vh>
    </>
  );
};

export default App;
