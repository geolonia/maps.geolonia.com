import { describe, expect, it } from 'vitest';
import { createZoomLimitsUpdater, type ZoomLimitsMap } from './zoom-limits';

// MapLibre と同じく、下限が上限を超える呼び出しは投げる
const fakeMap = () => {
  const calls: string[] = [];
  let max = 22;
  let min = 0;
  const map: ZoomLimitsMap = {
    setMaxZoom: (z) => {
      const next = z ?? 22;
      if (next < min) throw new Error('maxZoom must be greater than or equal to minZoom');
      max = next;
      calls.push(`max:${z}`);
    },
    setMinZoom: (z) => {
      const next = z ?? 0;
      if (next > max) throw new Error('minZoom must be less than or equal to maxZoom');
      min = next;
      calls.push(`min:${z}`);
    },
  };
  return { map, calls };
};

describe('createZoomLimitsUpdater', () => {
  it('applies the zoom limits in the style metadata', () => {
    const { map, calls } = fakeMap();
    createZoomLimitsUpdater(map)({ 'geolonia:maxzoom': 18, 'geolonia:minzoom': 4 });
    expect(calls).toEqual([ 'min:4', 'max:18' ]);
  });

  it('keeps a limit of 0', () => {
    const { map, calls } = fakeMap();
    createZoomLimitsUpdater(map)({ 'geolonia:maxzoom': 0, 'geolonia:minzoom': 0 });
    expect(calls).toEqual([ 'min:0', 'max:0' ]);
  });

  it('lowers the minimum before the maximum when both go down', () => {
    const { map, calls } = fakeMap();
    const update = createZoomLimitsUpdater(map);
    update({ 'geolonia:maxzoom': 18, 'geolonia:minzoom': 16 });
    update({ 'geolonia:maxzoom': 12, 'geolonia:minzoom': 4 });
    expect(calls).toEqual([ 'min:16', 'max:18', 'min:4', 'max:12' ]);
  });

  it('raises the maximum before the minimum when the new minimum is above the current maximum', () => {
    const { map, calls } = fakeMap();
    const update = createZoomLimitsUpdater(map);
    update({ 'geolonia:maxzoom': 12, 'geolonia:minzoom': 4 });
    update({ 'geolonia:maxzoom': 18, 'geolonia:minzoom': 16 });
    expect(calls).toEqual([ 'min:4', 'max:12', 'max:18', 'min:16' ]);
  });

  it('applies a limit again when the map rejected it the last time', () => {
    const { map } = fakeMap();
    let fail = true;
    const setMaxZoom = map.setMaxZoom;
    const applied: (number | undefined)[] = [];
    map.setMaxZoom = (z) => {
      if (fail) throw new Error('rejected');
      applied.push(z);
      return setMaxZoom(z);
    };
    const update = createZoomLimitsUpdater(map);
    expect(() => update({ 'geolonia:maxzoom': 18 })).toThrow('rejected');
    fail = false;
    update({ 'geolonia:maxzoom': 18 });
    expect(applied).toEqual([ 18 ]);
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
    expect(calls).toEqual([ 'min:4', 'max:18', 'min:undefined', 'max:undefined' ]);
  });
});
