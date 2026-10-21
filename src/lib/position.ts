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
