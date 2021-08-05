import React, { useCallback, useRef } from "react";
import type { Map } from "mapbox-gl";
import GeoloniaMap from "./GeoloniaMap";

const App: React.FC = () => {
  const mapRef = useRef<Map>()
  
  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  return (
    <GeoloniaMap 
      style={{ width: "100vw", height: "100vh" }}
      options={{
        zoom: 6,
        center: [136.944, 35.645],
        fullscreenControl: "on",
        hash: "map",
      }}
      onLoad={onLoad}
    />
  );
}

export default App;
