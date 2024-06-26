import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LngLatBounds, Map } from 'maplibre-gl';
import { GeoloniaMap } from '@geolonia/embed-react';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import Div100vh from 'react-div-100vh';
import { normalize } from '@geolonia/normalize-any-latlng';

interface SearchFormControlsCollection extends HTMLFormControlsCollection {
  q: HTMLInputElement
}

const parseHash = (url?: Location | URL) => {
  const qstr = (url || window.location).hash.substring(1);
  const q = new URLSearchParams(qstr);
  return q;
};

const updateHash = (q: URLSearchParams) => {
  window.location.hash = `#${q.toString().replace(/%2F/g, '/')}`;
};

const parseTilesetOverrideHash = () => {
  const overrideStr = parseHash().get('tilesetOverride');
  return (overrideStr || '').split(';').reduce<{[key: string]: string}>((map, current) => {
    const [styleId, newId] = current.split(':', 2);
    map[styleId] = newId;
    return map;
  }, {});
};

const styleIdToUrl = (style: string, lang?: string) => {
  if (style.startsWith('https://')) {
    return style;
  }
  if (lang && lang !== 'auto') {
    return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
  }
  return style.split(';')[0];
};

interface InitialSavedState {
  z: number
  lat: number
  lng: number
  style: string
  lang: string
}

const INITIAL_STATE: InitialSavedState = {
  z: 6,
  lng: 136.944,
  lat: 35.645,
  style: 'geolonia/basic',
  lang: 'auto',
};

const getCurrentSavedState = () => {
  let state: InitialSavedState = INITIAL_STATE;
  try {
    let rawState: string | null;
    if ('localStorage' in window && (rawState = localStorage.getItem('geolstate')) && rawState) {
      state = {
        ...INITIAL_STATE,
        ...JSON.parse(rawState),
      } as InitialSavedState;
    }
  } catch {
    // no-op
  }
  return state;
};

const getDefaultCameraOptions = (state: InitialSavedState) => {
  const mapStr = parseHash().get('map') || `${state.z}/${state.lat}/${state.lng}`;
  const [ zoom, lat, lng ] = mapStr.split('/');
  return {
    center: {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    },
    zoom: parseFloat(zoom),
  };
};

const App: React.FC = () => {
  const [ zLatLngString, setZLatLngString ] = useState<string>('');
  const mapRef = useRef<Map>();

  const savedState = useMemo(getCurrentSavedState, []);

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

  const onLoad = useCallback((map: Map) => {
    mapRef.current = map;
    (window as any)._mainMap = map;

    const currentState = getCurrentSavedState();
    const cameraOptions = getDefaultCameraOptions(currentState);
    map.jumpTo(cameraOptions);

    map.on('moveend', () => {
      // see: https://github.com/maplibre/maplibre-gl-js/blob/ba7bfbc846910c5ae848aaeebe4bde6833fc9cdc/src/ui/hash.js#L59
      const center = map.getCenter(),
        rawZoom = map.getZoom(),
        zoom = Math.round(rawZoom * 100) / 100,
        // derived from equation: 512px * 2^z / 360 / 10^d < 0.5px
        precision = Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10),
        m = Math.pow(10, precision),
        lng = Math.round(center.lng * m) / m,
        lat = Math.round(center.lat * m) / m,
        zStr = Math.ceil(zoom);

      setZLatLngString(`${zStr}/${lat}/${lng}`);
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

    // https://github.com/geolonia/embed/issues/270
    // Geolonia の Embed API の transformRequest 関数は geolonia のソースには適用されない。
    // そのため、先に Embed API の transformRequest を走らせて、その後、更に変形する
    const origTransformRequest: maplibregl.RequestTransformFunction = (map as any)._requestManager._transformRequestFn;
    const newTransformRequest: maplibregl.RequestTransformFunction = (url, resourceType) => {
      const treq = origTransformRequest(url, resourceType);
      if (treq) {
        const replaceMap = parseTilesetOverrideHash();
        treq.url = treq.url.replace(
          /^(https:\/\/tileserver(?:-[^.]+)?\.geolonia\.com\/)([^/]+)\//,
          (_match, g1, g2) => {
            return `${g1}${replaceMap[g2] || g2}/`;
          },
        );
      }
      return treq || { url };
    };
    (map as any)._requestManager._transformRequestFn = newTransformRequest;
  }, [setSavedState]);

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
      data = {
        type: 'FeatureCollection',
        features: queriesInCoord.map((coord) => {
          const { lat, lng } = coord as { lat: number, lng: number };
          const lat_prefix = lat >= 0 ? '北緯' : '南緯';
          const lng_prefix = lng >= 0 ? '東経' : '西経';
          const index = `${lat_prefix}${Math.round(Math.abs(lat) * 10000) / 10000}°, ${lng_prefix}${Math.round(Math.abs(lng) * 10000) / 10000}°`;
          return {
            type: 'Feature',
            properties: { index },
            geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
          };
        }),
      };
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
      const geoJsonSource = source as maplibregl.GeoJSONSource;
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
        //@ts-ignore
        bounds = new geolonia.LngLatBounds(f.geometry.coordinates, f.geometry.coordinates);
      } else {
        bounds.extend(f.geometry.coordinates as [number, number]);
      }
    }
    if (typeof bounds !== 'undefined') {
      map.fitBounds(bounds, { padding: 200 });
    }
  }, []);

  const stage = useMemo(() => (
    parseHash().get('stage') || window.localStorage.getItem('_geoloniaStageOverride') || 'v1'
  ), []);

  const handleStageChange = useCallback<React.MouseEventHandler<HTMLButtonElement>>((ev) => {
    ev.preventDefault();
    const newStage = stage === 'dev' ? 'v1' : 'dev';
    window.localStorage.setItem('_geoloniaStageOverride', newStage);
    const hashParams = parseHash();
    hashParams.set('stage', newStage);
    updateHash(hashParams);
    document.location.reload();
  }, [stage]);

  return (
    <>
      <Div100vh>
        <GeoloniaMap
          style={{ width: '100vw', height: '100%' }}
          initOptions={{ hash: 'map', style }}
          embedSrc={`https://cdn.geolonia.com/${stage}/embed?geolonia-api-key=YOUR-API-KEY`}
          fullscreenControl="on"
          geolocateControl="on"
          gestureHandling="off"
          marker="off"
          render3d="on"
          scaleControl="bottom-right"
          mapStyle={currentStyleUrl}
          onLoad={onLoad}
        >
          <GeoloniaMap.Control position='top-left' containerProps={{ className: 'mapboxgl-ctrl maplibregl-ctrl' }}>
            <select
              onChange={onMapStyleChange}
              defaultValue={defaultStyleFromHash}
              style={{ marginRight: '10px' }}
            >
              <optgroup label="標準スタイル">
                <option value="geolonia/basic-v1">Basic v1</option>
                <option value="geolonia/basic">Basic (Legacy)</option>
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
          </GeoloniaMap.Control>
          <GeoloniaMap.Control position='top-left' containerProps={{ className: 'mapboxgl-ctrl maplibregl-ctrl' }}>
            <form id="searchControl" onSubmit={handleSearch}>
              <input
                type="search"
                placeholder="検索..."
                name="q"
              />
            </form>
          </GeoloniaMap.Control>
        </GeoloniaMap>
      </Div100vh>
    </>
  );
};

export default App;
