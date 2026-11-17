import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { pointBounds } from './bounds';

const collection = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

const point = (lng: number, lat: number): FeatureCollection['features'][number] => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Point', coordinates: [lng, lat] },
});

describe('pointBounds', () => {
  it('returns undefined when there are no points', () => {
    expect(pointBounds(collection([]))).toBeUndefined();
    expect(pointBounds(collection([{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    }]))).toBeUndefined();
  });

  it('returns a zero-size box for one point', () => {
    expect(pointBounds(collection([point(139.767, 35.681)]))).toEqual([[139.767, 35.681], [139.767, 35.681]]);
  });

  it('returns the south-west and north-east corners of the points', () => {
    expect(pointBounds(collection([
      point(139.767, 35.681),
      point(135.495, 34.702),
      point(140.0, 35.0),
    ]))).toEqual([[135.495, 34.702], [140.0, 35.681]]);
  });
});
