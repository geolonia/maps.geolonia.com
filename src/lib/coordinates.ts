import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

export const coordinatesToFeatureCollection = (
  coords: { lat: number, lng: number }[],
): FeatureCollection<Geometry, GeoJsonProperties> => ({
  type: 'FeatureCollection',
  features: coords.map(({ lat, lng }) => {
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
});
