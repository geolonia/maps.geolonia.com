import type { EaseToOptions } from 'maplibre-gl';

// 使うメソッドだけに絞り、テストでは偽の地図を渡せるようにする
export type CircleFlightMap = {
  getBearing: () => number
  getPitch: () => number
  easeTo: (options: EaseToOptions) => unknown
  stop: () => unknown
  on: (type: 'moveend' | 'mousedown' | 'touchstart' | 'wheel', listener: () => void) => unknown
  off: (type: 'moveend' | 'mousedown' | 'touchstart' | 'wheel', listener: () => void) => unknown
};

// 1 周 60 秒。easeTo は 180 度を超える回転を逆回りにするので、1/4 周ずつつなぐ
const STEP_DEGREES = 90;
const STEP_DURATION = 15_000;
// 真上から見下ろしていると回っても景色が変わらないので、ドローンのように斜めから見る
const MIN_PITCH = 45;
const FLIGHT_PITCH = 60;
const USER_EVENTS = ['mousedown', 'touchstart', 'wheel'] as const;

const linear = (t: number) => t;
// getBearing() は -180 から 180 の範囲に丸めて返すので、差も同じ範囲で比べる
const angleDifference = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;

// ドローンのサークル飛行のように、地図の中心を軸にカメラを回し続ける
export class CircleFlight {
  private running = false;
  private targetBearing = 0;

  constructor(private readonly map: CircleFlightMap, private readonly onStop?: () => void) {}

  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.map.on('moveend', this.handleMoveEnd);
    for (const type of USER_EVENTS) {
      this.map.on(type, this.stop);
    }
    this.rotate(this.map.getPitch() < MIN_PITCH ? FLIGHT_PITCH : undefined);
  }

  stop = () => {
    if (!this.running) return;
    this.running = false;
    // map.stop() が moveend を出すので、先に外す
    this.map.off('moveend', this.handleMoveEnd);
    for (const type of USER_EVENTS) {
      this.map.off(type, this.stop);
    }
    this.map.stop();
    this.onStop?.();
  };

  private rotate(pitch?: number) {
    this.targetBearing = this.map.getBearing() + STEP_DEGREES;
    this.map.easeTo({ bearing: this.targetBearing, pitch, duration: STEP_DURATION, easing: linear });
  }

  // 1/4 周を回り切る前に止まったときは、ほかの操作がカメラを動かしたので止める
  private handleMoveEnd = () => {
    if (Math.abs(angleDifference(this.map.getBearing(), this.targetBearing)) > 0.01) {
      this.stop();
      return;
    }
    this.rotate();
  };
}
