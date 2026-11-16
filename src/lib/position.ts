// see: https://github.com/maplibre/maplibre-gl-js/blob/ba7bfbc846910c5ae848aaeebe4bde6833fc9cdc/src/ui/hash.js#L59
export const formatPosition = (center: { lng: number, lat: number }, rawZoom: number) => {
  const zoom = Math.round(rawZoom * 100) / 100,
    // derived from equation: 512px * 2^z / 360 / 10^d < 0.5px
    precision = Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10),
    m = Math.pow(10, precision),
    lng = Math.round(center.lng * m) / m,
    lat = Math.round(center.lat * m) / m,
    zStr = Math.ceil(zoom);

  return { zLatLng: `${zStr}/${lat}/${lng}`, lat, lng };
};

export type CameraState = {
  getZoom(): number;
  getCenter(): { lng: number, lat: number };
  getBearing(): number;
  getPitch(): number;
};

// MapLibre の hash の map= と同じ書式。方位と傾きが 0 なら省き、傾きだけ 0 なら傾きを省く
// see: https://github.com/maplibre/maplibre-gl-js/blob/v6.15.0/src/ui/hash.ts#L46
export const formatCameraHash = (map: CameraState) => {
  const rawZoom = map.getZoom();
  const zoom = Math.round(rawZoom * 100) / 100;
  const { lat, lng } = formatPosition(map.getCenter(), rawZoom);
  const bearing = map.getBearing();
  const pitch = map.getPitch();
  let hash = `${zoom}/${lat}/${lng}`;
  if (bearing || pitch) hash += `/${Math.round(bearing * 10) / 10}`;
  if (pitch) hash += `/${Math.round(pitch)}`;
  return hash;
};
