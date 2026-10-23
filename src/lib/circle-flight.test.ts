import { describe, expect, it, vi } from 'vitest';
import { CircleFlight, type CircleFlightMap } from './circle-flight';

type EaseToOptions = Parameters<CircleFlightMap['easeTo']>[0];

// easeTo を呼ぶと、渡した向きと傾きにすぐ着いたものとして扱う地図
// MapLibre と同じく、getBearing() は -180 から 180 の範囲に丸めて返す
const createFakeMap = (bearing = 0, pitch = 0) => {
  const listeners = new Map<string, Set<() => void>>();
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const easeTo = vi.fn<(options: EaseToOptions) => void>();
  const map = {
    getBearing: () => ((bearing + 180) % 360 + 360) % 360 - 180,
    getPitch: () => pitch,
    easeTo,
    stop: vi.fn(),
    on: (type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    off: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  const arrive = () => {
    const options = easeTo.mock.lastCall![0];
    bearing = options.bearing ?? bearing;
    pitch = options.pitch ?? pitch;
    fire('moveend');
  };
  const interrupt = () => {
    bearing += 1;
    fire('moveend');
  };
  const listenerCount = () => [...listeners.values()].reduce((count, set) => count + set.size, 0);
  return { map, fire, arrive, interrupt, listenerCount };
};

describe('CircleFlight', () => {
  it('rotates the camera by a quarter turn at a constant speed', () => {
    const { map } = createFakeMap(10, 60);
    new CircleFlight(map).start();

    expect(map.easeTo).toHaveBeenCalledTimes(1);
    const options = map.easeTo.mock.lastCall![0];
    expect(options.bearing).toBe(100);
    expect(options.duration).toBe(15_000);
    expect(options.easing!(0.25)).toBe(0.25);
    expect(options.pitch).toBeUndefined();
    // 動きを減らす OS の設定では、essential でないと MapLibre が duration を 0 にする
    expect(options.essential).toBe(true);
  });

  it('keeps rotating after each quarter turn, across the -180/180 boundary', () => {
    const { map, arrive } = createFakeMap(0, 60);
    const flight = new CircleFlight(map);
    flight.start();

    arrive();
    arrive();
    arrive();
    arrive();
    expect(map.easeTo.mock.calls.map(([options]) => options.bearing)).toEqual([90, 180, -90, 0, 90]);
    expect(flight.isRunning()).toBe(true);
  });

  it('tilts a flat map while it starts rotating', () => {
    const { map } = createFakeMap(0, 20);
    new CircleFlight(map).start();

    expect(map.easeTo.mock.lastCall![0].pitch).toBe(60);
  });

  it('stops and removes its listeners when stopped', () => {
    const { map, arrive, listenerCount } = createFakeMap();
    const flight = new CircleFlight(map);
    flight.start();
    expect(flight.isRunning()).toBe(true);

    flight.stop();
    expect(flight.isRunning()).toBe(false);
    expect(map.stop).toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
    arrive();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });

  it('stops when the user touches the map', () => {
    for (const type of ['mousedown', 'touchstart', 'wheel']) {
      const { map, fire } = createFakeMap();
      const flight = new CircleFlight(map);
      flight.start();

      fire(type);
      expect(flight.isRunning()).toBe(false);
    }
  });

  it('stops when something else moves the camera before the quarter turn ends', () => {
    const { map, interrupt } = createFakeMap();
    const onStop = vi.fn();
    const flight = new CircleFlight(map, onStop);
    flight.start();

    interrupt();
    expect(flight.isRunning()).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });

  it('does nothing when started twice', () => {
    const { map } = createFakeMap();
    const flight = new CircleFlight(map);
    flight.start();
    flight.start();

    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });
});
