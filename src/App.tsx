import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LngLatBounds, Map, IControl } from "mapbox-gl";
import GeoloniaMap from "./GeoloniaMap";
import ReactDOM from "react-dom";
import { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import Div100vh from 'react-div-100vh'

interface SearchFormControlsCollection extends HTMLFormControlsCollection {
  q: HTMLInputElement
}

const Portal: React.FC<{container: HTMLDivElement}> = ({children, container}) => {
  return ReactDOM.createPortal(children, container);
};

class PortalControl implements IControl {
  _map: Map | undefined;
  _container: HTMLDivElement;

  constructor(container: HTMLDivElement) {
    this._container = container
  }

  onAdd(map: Map) {
    this._map = map;
    return this._container;
  }

  onRemove() {
    this._container.parentNode?.removeChild(this._container);
    this._map = undefined;
  }
}

const parseHash = () => {
  const qstr = window.location.hash.substr(1);
  const q = new URLSearchParams(qstr);
  return q;
}

const updateHash = (q: URLSearchParams) => {
  window.location.hash = '#' + q.toString().replace(/%2F/g, '/');
};

const styleIdToUrl = (style: string, lang?: string) => {
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
        ...JSON.parse(rawState)
      } as InitialSavedState;
    }
  } catch {} finally {
    return state;
  }
};

const App: React.FC = () => {
  const [ zLatLngString, setZLatLngString ] = useState<string>("");
  const mapRef = useRef<Map>();

  const savedState = useMemo(getCurrentSavedState, []);

  const setSavedState = useCallback((input: Partial<InitialSavedState>) => {
    const currentState = getCurrentSavedState();
    const newState: InitialSavedState = {...currentState, ...input};
    const rawState = JSON.stringify(newState);
    try {
      window.localStorage.setItem('geolstate', rawState);
    } catch (e) {}
  }, []);

  const defaultStyleFromHash = useMemo(() => {
    return parseHash().get('style') || savedState.style;
  }, [savedState.style]);

  const defaultLanguageFromHash = useMemo(() => {
    return parseHash().get('lang') || savedState.lang;
  }, [savedState.lang]);

  const defaultStyleUrl = styleIdToUrl(defaultStyleFromHash, defaultLanguageFromHash);

  const [ style, setStyle ] = useState<string>(defaultStyleFromHash);
  const [ language, setLanguage ] = useState<string>(defaultLanguageFromHash);

  const switcherControlDiv = useMemo(() => {
    const div = document.createElement('div');
    div.className = 'mapboxgl-ctrl';
    return div;
  }, []);

  const searchControlDiv = useMemo(() => {
    const div = document.createElement('div');
    div.className = 'mapboxgl-ctrl';
    return div;
  }, []);

  const onLoad = useCallback((map: Map) => {
    mapRef.current = map;
    const switcherControl = new PortalControl(switcherControlDiv);
    map.addControl(switcherControl, 'top-left');

    const searchControl = new PortalControl(searchControlDiv);
    map.addControl(searchControl, 'top-left');

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

      setZLatLngString(`#map=${zStr}/${lat}/${lng}`);
      setSavedState({ z: rawZoom, lat, lng });
    });
  }, [searchControlDiv, setSavedState, switcherControlDiv]);

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
    if (language && language !== 'auto') {
      hash.set('lang', language);
    } else {
      hash.delete('lang');
    }
    updateHash(hash);
    const newStyleUrl = styleIdToUrl(style, language);
    if (defaultStyleUrl !== newStyleUrl) {
      mapRef.current?.setStyle( newStyleUrl );
    }
  }, [ style, language, defaultStyleUrl ]);

  const handleSearch = useCallback<React.FormEventHandler<HTMLFormElement>>(async (ev) => {
    ev.preventDefault();

    const elements = ev.currentTarget.elements as SearchFormControlsCollection;
    const query = elements.q.value;

    const map = mapRef.current;
    if (!map) {
      return;
    }
    const qsa = new URLSearchParams();
    qsa.set('q', query);
    const {lng, lat} = map.getCenter();
    qsa.set('pos', `${lng},${lat}`);
    const resp = await fetch(
      `https://api.maps.geolonia.com/v1/search?${qsa.toString()}`, {
        method: 'get',
      }
    )
    const body = await resp.json();
    if (body.error === true) {
      console.error(body);
      return;
    }

    const data = body.geojson as FeatureCollection<Geometry, GeoJsonProperties>

    const source = map.getSource('search-results');
    if (source) {
      if (source.type !== 'geojson') return;
      source.setData(data);
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
      if (f.geometry.type !== "Point") continue;
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

  return (
    <>
      <Div100vh>
        <GeoloniaMap
          style={{ width: "100vw", height: "100%"}}
          options={{
            "data-zoom": savedState.z,
            "data-lng": savedState.lng,
            "data-lat": savedState.lat,
            "data-fullscreen-control": "on",
            "data-geolocate-control": "on",
            "data-gesture-handling": "off",
            "data-marker": "off",
            "data-3d": "on",
            "data-scale-control": "bottom-right",
            "data-style": defaultStyleUrl,
          }}
          onLoad={onLoad}
        />
      </Div100vh>
      <Portal container={switcherControlDiv}>
        <select
          onChange={onMapStyleChange}
          defaultValue={defaultStyleFromHash}
          style={{ marginRight: "10px" }}
        >
          <option value="geolonia/basic">Basic</option>
          <option value="geolonia/gsi">GSI</option>
          <option value="geolonia/homework">Homework</option>
          <option value="geolonia/midnight">Midnight</option>
          <option value="geolonia/notebook">Notebook</option>
          <option value="geolonia/red-planet">Red Planet</option>
        </select>
        <select
          onChange={onMapLanguageChange}
          defaultValue={defaultLanguageFromHash}
          style={{ marginRight: "10px" }}
        >
          <option value="auto">Auto / 自動判定</option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
        <a
          href={`https://openstreetmap.org/${zLatLngString}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ext openstreetmap-link"
        >
          OpenStreetMap で開く
        </a>
      </Portal>
      <Portal container={searchControlDiv}>
        <form id="searchControl" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="検索..."
            name="q"
          />
        </form>
      </Portal>
    </>
  );
}

export default App;
