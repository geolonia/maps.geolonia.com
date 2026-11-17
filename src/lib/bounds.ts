import type { FeatureCollection } from 'geojson';

export type Corners = [[number, number], [number, number]];

// MapLibre と MachGL のどちらの fitBounds にも渡せるように、クラスではなく [南西, 北東] の配列で返す
export const pointBounds = (data: FeatureCollection): Corners | undefined => {
  let bounds: Corners | undefined;
  for (const f of data.features) {
    if (f.geometry.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates;
    if (typeof bounds === 'undefined') {
      bounds = [[lng, lat], [lng, lat]];
    } else {
      bounds[0][0] = Math.min(bounds[0][0], lng);
      bounds[0][1] = Math.min(bounds[0][1], lat);
      bounds[1][0] = Math.max(bounds[1][0], lng);
      bounds[1][1] = Math.max(bounds[1][1], lat);
    }
  }
  return bounds;
};
