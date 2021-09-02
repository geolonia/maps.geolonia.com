import React, { useLayoutEffect, useRef } from "react";
import type { Map } from "mapbox-gl";

interface Props {
  options: { [key: string]: any }
  style?: React.CSSProperties
  onLoad?: (map: Map) => void
}

const GeoloniaMap: React.FC<Props> = (props) => {
  const { options, onLoad } = props;
  const mapContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // @ts-ignore
    const { geolonia } = window;
    const map = new geolonia.Map({
      container: mapContainer.current,
      hash: 'map',
    }) as Map;
    if (onLoad) {
      onLoad(map);
    }
  }, [ onLoad ]);

  return (
    <div
      ref={mapContainer}
      style={props.style}
      {...options}
    />
  );
}

export default GeoloniaMap;
