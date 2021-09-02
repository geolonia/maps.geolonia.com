import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map, IControl } from "mapbox-gl";
import GeoloniaMap from "./GeoloniaMap";
import ReactDOM from "react-dom";

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

  const onLoad = useCallback((map: Map) => {
    mapRef.current = map;
    const switcherControl = new PortalControl(switcherControlDiv);
    map.addControl(switcherControl, 'top-left');

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
  }, [setSavedState, switcherControlDiv]);

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

  return (
    <>
      <GeoloniaMap
        style={{ width: "100vw", height: "100vh" }}
        options={{
          "data-zoom": savedState.z,
          "data-lng": savedState.lng,
          "data-lat": savedState.lat,
          "data-fullscreen-control": "on",
          "data-geolocate-control": "on",
          "data-gesture-handling": "off",
          "data-marker": "off",
          "data-3d": "on",
          "data-style": defaultStyleUrl,
        }}
        onLoad={onLoad}
      />
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
    </>
  );
}

export default App;
