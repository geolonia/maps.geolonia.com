import { describe, expect, it } from 'vitest';
import { coordinatesToFeatureCollection } from './coordinates';

describe('coordinatesToFeatureCollection', () => {
  it('turns each coordinate into a point labeled in Japanese', () => {
    expect(coordinatesToFeatureCollection([{ lat: 34.6937, lng: 135.5023 }])).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { index: '北緯34.6937°, 東経135.5023°' },
          geometry: { type: 'Point', coordinates: [135.5023, 34.6937] },
        },
      ],
    });
  });

  it('uses south and west in the label for negative values and rounds to 4 digits', () => {
    const fc = coordinatesToFeatureCollection([{ lat: -33.868819, lng: -151.209295 }]);
    expect(fc.features[0].properties).toEqual({ index: '南緯33.8688°, 西経151.2093°' });
  });

  it('returns an empty collection for no coordinates', () => {
    expect(coordinatesToFeatureCollection([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
