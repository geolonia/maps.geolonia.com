import type { EaseToOptions } from 'maplibre-gl';
import { claimCamera, releaseCamera, type CameraOwner } from './camera-owner';

// 使うメソッドだけに絞り、テストでは偽の地図を渡せるようにする
export type TourMap = {
  getCenter: () => { lng: number, lat: number }
  getBearing: () => number
  easeTo: (options: EaseToOptions) => unknown
  stop: () => unknown
  on: (type: 'moveend' | 'mousedown' | 'touchstart' | 'wheel', listener: () => void) => unknown
  off: (type: 'moveend' | 'mousedown' | 'touchstart' | 'wheel', listener: () => void) => unknown
};

export type Landmark = {
  name: string
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
};

// MapLibre は傾きを 60 度までに抑えるので、それより大きい値は 60 度で見せる
export const LANDMARKS: Landmark[] = [
  { name: '東京タワー', center: [139.7454, 35.6586], zoom: 16.5, pitch: 72, bearing: 20 },
  { name: 'フジテレビ', center: [139.7745, 35.6268], zoom: 16.9, pitch: 70, bearing: 130 },
  { name: '羽田空港', center: [139.7865, 35.5497], zoom: 15.6, pitch: 68, bearing: 200 },
  { name: '神宮球場', center: [139.7173, 35.6745], zoom: 17.4, pitch: 68, bearing: 250 },
  { name: '東京都庁', center: [139.6917, 35.6896], zoom: 16.8, pitch: 70, bearing: 60 },
  { name: '東京駅', center: [139.7671, 35.6812], zoom: 16.8, pitch: 72, bearing: 300 },
];

const MOVE_DURATION = 2_200;
// 名所の周りを 1/4 周する。easeTo は 180 度を超える回転を逆回りにするので、90 度にとどめる
const ORBIT_DEGREES = 90;
const ORBIT_DURATION = 7_000;
const OVERVIEW_ZOOM = 15.1;
const OVERVIEW_PITCH = 50;
const USER_EVENTS = ['mousedown', 'touchstart', 'wheel'] as const;

const linear = (t: number) => t;
// getBearing() は -180 から 180 の範囲に丸めて返すので、差も同じ範囲で比べる
const angleDifference = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

// 順番を混ぜる。周の変わり目で同じ名所が続かないよう、前の周の最後を先頭に置かない
export const shuffleLandmarks = (landmarks: Landmark[], previous: Landmark | undefined, random: () => number) => {
  const result = [...landmarks];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result[0] === previous) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
};

const wrapLongitude = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180;

// 今の位置と名所の中間の経度。日付変更線をまたぐ側が近ければそちらを回る。
// URL のハッシュで -180 から 180 の外の経度を渡すと、地図はそのまま返すことがあるので、差で求めてから折り返す
const midLongitude = (from: number, to: number) => wrapLongitude(to + angleDifference(from, to) / 2);

// 名所ごとに、今の位置との中間の地点へ移ってから寄り、名所を中心に回る
const legsFor = (landmark: Landmark, from: { lng: number, lat: number }): EaseToOptions[] => [
  {
    center: [midLongitude(from.lng, landmark.center[0]), (from.lat + landmark.center[1]) / 2],
    zoom: OVERVIEW_ZOOM,
    pitch: OVERVIEW_PITCH,
    bearing: landmark.bearing - 30,
    duration: MOVE_DURATION,
  },
  { center: landmark.center, zoom: landmark.zoom, pitch: landmark.pitch, bearing: landmark.bearing, duration: MOVE_DURATION },
  { bearing: landmark.bearing + ORBIT_DEGREES, duration: ORBIT_DURATION, easing: linear },
];

const CENTER_TOLERANCE = 1e-6;

// 東京の名所を、止めるまで順に巡る
export class Tour implements CameraOwner {
  private running = false;
  private queue: Landmark[] = [];
  private legs: EaseToOptions[] = [];
  private previous?: Landmark;
  private targetBearing = 0;
  private targetCenter?: [number, number];

  constructor(
    private readonly map: TourMap,
    private readonly onStop?: () => void,
    private readonly random: () => number = Math.random,
    private readonly landmarks: Landmark[] = LANDMARKS,
  ) {}

  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.queue = [];
    this.legs = [];
    for (const type of USER_EVENTS) {
      this.map.on(type, this.stop);
    }
    claimCamera(this.map, this);
    // MapLibre の easeTo は動いているカメラ（ほかのアニメーション）を止め、その moveend をその場で出す。それを自分の移動の終わりと取り違えないよう、最初の移動を始めてから受け取る
    this.next();
    this.map.on('moveend', this.handleMoveEnd);
  }

  stop = () => {
    this.finish(true);
  };

  // 同じ地図でほかの機能がカメラを動かし始めた
  yieldCamera() {
    this.finish(false);
  }

  // ほかの操作がカメラを動かし始めて止まるときは、その動きを止めないよう map.stop() を呼ばない
  private finish(stopCamera: boolean) {
    if (!this.running) return;
    this.running = false;
    releaseCamera(this.map, this);
    // map.stop() が moveend を出すので、先に外す
    this.map.off('moveend', this.handleMoveEnd);
    for (const type of USER_EVENTS) {
      this.map.off(type, this.stop);
    }
    if (stopCamera) {
      this.map.stop();
    }
    this.onStop?.();
  }

  private next() {
    if (this.legs.length === 0) {
      if (this.queue.length === 0) {
        this.queue = shuffleLandmarks(this.landmarks, this.previous, this.random);
      }
      const landmark = this.queue.shift()!;
      this.previous = landmark;
      this.legs = legsFor(landmark, this.map.getCenter());
    }
    const leg = this.legs.shift()!;
    this.targetBearing = leg.bearing ?? this.map.getBearing();
    this.targetCenter = leg.center as [number, number] | undefined;
    // 動きを減らす OS の設定でも、押した人が望んだ動きなので essential にする。
    // そうしないと duration が 0 になり、moveend から次の移動を呼び続ける
    this.map.easeTo({ ...leg, essential: true });
  }

  // 向きか中心が着く前に止まったときは、ほかの操作がカメラを動かしたので止める。
  // 前の区間と向きが同じ区間があるので、中心を持つ区間では中心も比べる。
  // 傾きとズームは地図ごとの上限で抑えられるので、比べない
  private handleMoveEnd = () => {
    if (Math.abs(angleDifference(this.map.getBearing(), this.targetBearing)) > 0.01 || !this.reachedCenter()) {
      this.finish(false);
      return;
    }
    this.next();
  };

  private reachedCenter() {
    if (!this.targetCenter) return true;
    const { lng, lat } = this.map.getCenter();
    // 経度は、地図が日付変更線の上を 180 と -180 のどちらで返しても同じ位置として比べる
    return Math.abs(angleDifference(lng, this.targetCenter[0])) < CENTER_TOLERANCE && Math.abs(lat - this.targetCenter[1]) < CENTER_TOLERANCE;
  }
}
