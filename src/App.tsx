import React, { useCallback, useRef } from "react";
import type { Map } from "mapbox-gl";
import GeoloniaMap from "./GeoloniaMap";

const App: React.FC = () => {
  const mapRef = useRef<Map>();
  
  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  return (
    <GeoloniaMap 
      style={{ width: "100vw", height: "100vh" }}
      options={{
        "data-zoom": "6",
        "data-lng": "136.944",
        "data-lat": "35.645",
        "data-fullscreen-control": "on",
        "data-geolocate-control": "on",
        "data-marker": "off",
      }}
      onLoad={onLoad}
    />
  );
}

export default App;
