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
}

const styleIdToUrl = (style: string, lang?: string) => {
  if (lang && lang !== 'auto') {
    return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
  }
  return style.split(';')[0];
}

const App: React.FC = () => {
  const [ zLatLngString, setZLatLngString ] = useState<string>("");
  const mapRef = useRef<Map>();

  const defaultStyleFromHash = useMemo(() => {
    return parseHash().get('style') || "geolonia/basic";
  }, []);

  const defaultLanguageFromHash = useMemo(() => {
    return parseHash().get('lang') || "auto";
  }, []);

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
        zoom = Math.round(map.getZoom() * 100) / 100,
        // derived from equation: 512px * 2^z / 360 / 10^d < 0.5px
        precision = Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10),
        m = Math.pow(10, precision),
        lng = Math.round(center.lng * m) / m,
        lat = Math.round(center.lat * m) / m,
        zStr = Math.ceil(zoom);
      setZLatLngString(`#map=${zStr}/${lat}/${lng}`);
    });
  }, [switcherControlDiv]);

  const onMapStyleChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    setStyle(val);
  }, []);

  const onMapLanguageChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    setLanguage(val);
  }, []);

  useEffect(() => {
    const hash = parseHash();
    hash.set('style', style);
    if (language && language !== 'auto') {
      hash.set('lang', language);
    } else {
      hash.delete('lang');
    }
    updateHash(hash);
    mapRef.current?.setStyle( styleIdToUrl(style, language) );
  }, [ style, language ]);

  return (
    <>
      <GeoloniaMap
        style={{ width: "100vw", height: "100vh" }}
        options={{
          "data-zoom": "6",
          "data-lng": "136.944",
          "data-lat": "35.645",
          "data-fullscreen-control": "on",
          "data-geolocate-control": "on",
          "data-gesture-handling": "off",
          "data-marker": "off",
          "data-style": styleIdToUrl(defaultStyleFromHash),
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
