import React, { useCallback, useMemo, useRef } from "react";
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

const styleIdToUrl = (id: string) => {
  const [style, lang] = id.split(';');
  return `https://cdn.geolonia.com/style/${style}/${lang}.json`;
}

const App: React.FC = () => {
  const mapRef = useRef<Map>();
  const switcherControlDiv = useMemo(() => {
    const div = document.createElement('div');
    div.className = 'mapboxgl-ctrl';
    return div;
  }, []);

  const onLoad = useCallback((map: Map) => {
    mapRef.current = map;
    const switcherControl = new PortalControl(switcherControlDiv);
    map.addControl(switcherControl, 'top-left');
  }, [switcherControlDiv]);

  const onMapStyleChange: React.ChangeEventHandler<HTMLSelectElement> = useCallback((ev) => {
    const val = ev.target.value;
    const hash = parseHash();
    hash.set('style', val);
    updateHash(hash);
    mapRef.current?.setStyle( styleIdToUrl(val) );
  }, []);

  const defaultStyleFromHash = useMemo(() => {
    return parseHash().get('style') || "geolonia/basic;ja";
  }, []);

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
          "data-marker": "off",
          "data-style": styleIdToUrl(defaultStyleFromHash),
        }}
        onLoad={onLoad}
      />
      <Portal container={switcherControlDiv}>
        <select onChange={onMapStyleChange} defaultValue={defaultStyleFromHash}>
          <option value="geolonia/basic;ja">Basic (日本語)</option>
          <option value="geolonia/basic;en">Basic (English)</option>
          <option value="geolonia/gsi;ja">GSI (日本語)</option>
          <option value="geolonia/gsi;en">GSI (English)</option>
        </select>
      </Portal>
    </>
  );
}

export default App;
