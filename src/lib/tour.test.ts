import { describe, expect, it, vi } from 'vitest';
import { CircleFlight } from './circle-flight';
import { LANDMARKS, Tour, shuffleLandmarks, type TourMap } from './tour';

type EaseToOptions = Parameters<TourMap['easeTo']>[0];

// easeTo を呼ぶと、渡した位置と向きにすぐ着いたものとして扱う地図
// MapLibre と同じく、getBearing() は -180 から 180 の範囲に丸めて返す
const createFakeMap = (center = { lng: 139, lat: 35 }, bearing = 0) => {
  const listeners = new Map<string, Set<() => void>>();
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const easeTo = vi.fn<(options: EaseToOptions) => void>();
  const map = {
    getCenter: () => center,
    getPitch: () => 0,
    getBearing: () => ((bearing + 180) % 360 + 360) % 360 - 180,
    easeTo,
    stop: vi.fn(() => fire('moveend')),
    on: (type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    off: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  const arrive = () => {
    const options = easeTo.mock.lastCall![0];
    if (options.center) {
      const [lng, lat] = options.center as [number, number];
      center = { lng, lat };
    }
    bearing = options.bearing ?? bearing;
    fire('moveend');
  };
  const interrupt = () => {
    bearing += 1;
    fire('moveend');
  };
  const listenerCount = () => [...listeners.values()].reduce((count, set) => count + set.size, 0);
  return { map, fire, arrive, interrupt, listenerCount };
};

// 実際の地図のように、目標の中心からわずかにずれた位置に着く地図
const createFakeMapWithOffset = (offset: number) => {
  let center = { lng: 139, lat: 35 };
  let bearing = 0;
  const listeners = new Set<() => void>();
  const easeTo = vi.fn<(options: EaseToOptions) => void>();
  const map = {
    getCenter: (): { lng: number, lat: number } => center,
    getBearing: () => ((bearing + 180) % 360 + 360) % 360 - 180,
    getPitch: () => 0,
    easeTo,
    stop: vi.fn(),
    on: (type: string, listener: () => void) => { if (type === 'moveend') listeners.add(listener); },
    off: (type: string, listener: () => void) => { listeners.delete(listener); },
  };
  // moveCenter を false にすると、中心は getCenter の差し替えに任せる
  const fire = (moveCenter = true) => {
    const options = easeTo.mock.lastCall![0];
    if (moveCenter && options.center) {
      const [lng, lat] = options.center as [number, number];
      center = { lng: lng + offset, lat: lat - offset };
    }
    bearing = options.bearing ?? bearing;
    listeners.forEach((listener) => listener());
  };
  return { map, fire, easeTo };
};

// 混ぜない乱数。shuffleLandmarks は j = i になり、元の順番のまま返す
const keepOrder = () => 0.999;

describe('shuffleLandmarks', () => {
  it('keeps every landmark exactly once', () => {
    const result = shuffleLandmarks(LANDMARKS, undefined, Math.random);
    expect([...result].sort((a, b) => a.name.localeCompare(b.name))).toEqual([...LANDMARKS].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it('does not start with the landmark that ended the previous round', () => {
    const last = LANDMARKS[0];
    expect(shuffleLandmarks(LANDMARKS, last, keepOrder)[0]).not.toBe(last);
  });
});

describe('Tour', () => {
  it('pulls back to the midpoint, moves in to the landmark and orbits it', () => {
    const { map, arrive } = createFakeMap({ lng: 139, lat: 35 });
    new Tour(map, undefined, keepOrder).start();
    const first = LANDMARKS[0];

    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({
      center: [(139 + first.center[0]) / 2, (35 + first.center[1]) / 2],
      zoom: 15.1,
      bearing: first.bearing - 30,
      essential: true,
    }));
    arrive();
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({
      center: first.center,
      zoom: first.zoom,
      pitch: first.pitch,
      bearing: first.bearing,
    }));
    arrive();
    const orbit = map.easeTo.mock.lastCall![0];
    expect(orbit).toEqual(expect.objectContaining({ bearing: first.bearing + 90, duration: 7000, essential: true }));
    expect(orbit.easing?.(0.25)).toBe(0.25);
  });

  it('goes on to the next landmark after the orbit, starting from where it is', () => {
    const { map, arrive } = createFakeMap();
    new Tour(map, undefined, keepOrder).start();
    arrive();
    arrive();
    arrive();
    const [ first, second ] = LANDMARKS;
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({
      center: [(first.center[0] + second.center[0]) / 2, (first.center[1] + second.center[1]) / 2],
      bearing: second.bearing - 30,
    }));
  });

  it('visits every landmark and then starts another round', () => {
    const { map, arrive } = createFakeMap();
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    for (let i = 0; i < LANDMARKS.length * 3; i++) arrive();
    expect(tour.isRunning()).toBe(true);
    const visited = map.easeTo.mock.calls.filter((_, i) => i % 3 === 1).map(([ options ]) => options.center);
    expect(visited.slice(0, LANDMARKS.length)).toEqual(LANDMARKS.map((landmark) => landmark.center));
    // 次の周の最初は、前の周の最後と違う名所に向かう
    expect(visited[LANDMARKS.length]).not.toEqual(LANDMARKS[LANDMARKS.length - 1].center);
  });

  it('stops when something else moves the camera before it arrives', () => {
    const { map, interrupt, listenerCount } = createFakeMap();
    const onStop = vi.fn();
    const tour = new Tour(map, onStop, keepOrder);
    tour.start();
    interrupt();
    expect(tour.isRunning()).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(listenerCount()).toBe(0);
    // カメラを動かしているほかの操作（サークル飛行など）を止めない
    expect(map.stop).not.toHaveBeenCalled();
  });

  it('stops when something else moves the camera without turning it, on a leg that ends at the bearing it started from', () => {
    // フジテレビ（130 度）を 220 度まで回った後、神宮球場（250 度）へ向かう最初の区間も 220 度で終わる
    const order = [ 'フジテレビ', '神宮球場' ].map((name) => LANDMARKS.find((landmark) => landmark.name === name)!);
    const rest = LANDMARKS.filter((landmark) => !order.includes(landmark));
    const landmarks = [ ...order, ...rest ];
    const { map, arrive, fire } = createFakeMap();
    const tour = new Tour(map, undefined, keepOrder, landmarks);
    tour.start();
    arrive();
    arrive();
    arrive();
    expect(map.easeTo.mock.lastCall![0].bearing).toBe(220);
    // MachGL のズームのように、向きを変えずに中心だけ動かして止める
    fire('moveend');
    expect(tour.isRunning()).toBe(false);
  });

  it('keeps going when the map lands a tiny bit off the target center', () => {
    const { map, fire, easeTo } = createFakeMapWithOffset(1e-12);
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    fire();
    fire();
    expect(tour.isRunning()).toBe(true);
    expect(easeTo).toHaveBeenCalledTimes(3);
  });

  // 東京タワーは経度 139.7454。中間点は、出発地から近回りに半分進んだ経度にする
  it.each([
    [ 'a longitude outside -180 to 180', 400, (40 + 139.7454) / 2 ],
    [ 'the antimeridian', 180, 159.8727 ],
    [ 'the western hemisphere, across the antimeridian', -100, -160.1273 ],
    [ 'a longitude east of the landmark', 150, 144.8727 ],
  ])('takes the midpoint the short way from %s', (_, lng, expected) => {
    const { map } = createFakeMap({ lng, lat: 35 });
    new Tour(map, undefined, keepOrder).start();
    const [ midLng ] = map.easeTo.mock.lastCall![0].center as [number, number];
    expect(LANDMARKS[0].name).toBe('東京タワー');
    expect(midLng).toBeCloseTo(expected, 6);
  });

  it('keeps going when the map returns the target longitude on the other side of the antimeridian', () => {
    // 出発地の経度 -139.7454 と東京タワーの中間は、ちょうど日付変更線の上になる
    const { map, fire, easeTo } = createFakeMapWithOffset(0);
    map.getCenter = () => ({ lng: -139.7454, lat: 35 });
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    const [ midLng, midLat ] = easeTo.mock.lastCall![0].center as [number, number];
    expect(Math.abs(midLng)).toBeCloseTo(180, 6);
    map.getCenter = () => ({ lng: -midLng, lat: midLat });
    fire(false);
    expect(tour.isRunning()).toBe(true);
  });

  it.each([ 'mousedown', 'touchstart', 'wheel' ])('stops on %s', (type) => {
    const { map, fire, listenerCount } = createFakeMap();
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    fire(type);
    expect(tour.isRunning()).toBe(false);
    expect(map.stop).toHaveBeenCalledTimes(1);
    expect(listenerCount()).toBe(0);
  });

  it('does not move on after stop, although map.stop() fires moveend', () => {
    const { map } = createFakeMap();
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    tour.stop();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });

  it('starts from the first leg again after it was stopped', () => {
    const { map, arrive } = createFakeMap({ lng: 139, lat: 35 });
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    arrive();
    tour.stop();
    tour.start();
    expect(map.easeTo.mock.lastCall![0]).toEqual(expect.objectContaining({ zoom: 15.1, duration: 2200 }));
  });

  it('keeps going when its first move stops another animation, which fires moveend at once', () => {
    const { map, fire } = createFakeMap();
    // MapLibre の easeTo は、動いているカメラを止めてその moveend をその場で出してから動き出す
    map.easeTo.mockImplementationOnce(() => fire('moveend'));
    const tour = new Tour(map, undefined, keepOrder);
    tour.start();
    expect(tour.isRunning()).toBe(true);
  });

  it('stops without stopping the camera when the circle flight starts on the same map', () => {
    const { map } = createFakeMap();
    const onStop = vi.fn();
    const self = new Tour(map, onStop);
    self.start();
    new CircleFlight(map as never).start();
    expect(self.isRunning()).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(map.stop).not.toHaveBeenCalled();
  });

  it('ignores start while it is running', () => {
    const { map } = createFakeMap();
    const tour = new Tour(map);
    tour.start();
    tour.start();
    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });
});
