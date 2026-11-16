import { describe, expect, it } from 'vitest';
import { createZoomLimitsUpdater, type ZoomLimitsMap } from './zoom-limits';

const fakeMap = () => {
  const calls: string[] = [];
  const map: ZoomLimitsMap = {
    setMaxZoom: (z) => { calls.push(`max:${z}`); },
    setMinZoom: (z) => { calls.push(`min:${z}`); },
  };
  return { map, calls };
};

describe('createZoomLimitsUpdater', () => {
  it('applies the zoom limits in the style metadata', () => {
    const { map, calls } = fakeMap();
    createZoomLimitsUpdater(map)({ 'geolonia:maxzoom': 18, 'geolonia:minzoom': 4 });
    expect(calls).toEqual([ 'max:18', 'min:4' ]);
  });

  it('does not touch the map when a style has no limits', () => {
    const { map, calls } = fakeMap();
    createZoomLimitsUpdater(map)({});
    expect(calls).toEqual([]);
  });

  it('does not touch the map again while the limits stay the same', () => {
    const { map, calls } = fakeMap();
    const update = createZoomLimitsUpdater(map);
    update({ 'geolonia:maxzoom': 18 });
    update({ 'geolonia:maxzoom': 18 });
    update({ 'geolonia:maxzoom': 18 });
    expect(calls).toEqual([ 'max:18' ]);
  });

  it('resets a limit when the next style drops it', () => {
    const { map, calls } = fakeMap();
    const update = createZoomLimitsUpdater(map);
    update({ 'geolonia:maxzoom': 18, 'geolonia:minzoom': 4 });
    update({});
    expect(calls).toEqual([ 'max:18', 'min:4', 'max:undefined', 'min:undefined' ]);
  });
});
