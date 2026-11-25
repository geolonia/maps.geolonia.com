import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { registerCameraAnimation, type CameraAnimation } from './camera-animations';
import { CircleFlight } from './circle-flight';

// 読み上げでは押されているかを aria-pressed で伝えるので、名前は変えない。変わるのはマウスを載せたときの説明だけにする
const LABEL = 'サークル飛行';
const START_TITLE = 'サークル飛行を開始';
const STOP_TITLE = 'サークル飛行を停止';

// サークル飛行を開始・停止するボタン。MapLibre の標準コントロールと同じ見た目にする
export class CircleFlightControl implements IControl, CameraAnimation {
  private container?: HTMLElement;
  private button?: HTMLButtonElement;
  private flight?: CircleFlight;
  private unregister?: () => void;

  onAdd(map: MaplibreMap) {
    this.flight = new CircleFlight(map, () => this.render());

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-circle-flight';
    this.button.setAttribute('aria-label', LABEL);
    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.setAttribute('aria-hidden', 'true');
    this.button.appendChild(icon);
    this.button.addEventListener('click', this.toggle);
    this.container.appendChild(this.button);
    this.render();
    // WebMCP のツールも、このボタンと同じ実体を動かす
    this.unregister = registerCameraAnimation('circle-flight', this);
    return this.container;
  }

  onRemove() {
    this.unregister?.();
    this.unregister = undefined;
    this.flight?.stop();
    this.container?.remove();
    this.container = undefined;
    this.button = undefined;
    this.flight = undefined;
  }

  isRunning() {
    return this.flight?.isRunning() ?? false;
  }

  start() {
    this.flight?.start();
    this.render();
  }

  stop() {
    this.flight?.stop();
    this.render();
  }

  private toggle = () => {
    if (this.isRunning()) {
      this.stop();
    } else {
      this.start();
    }
  };

  private render() {
    if (!this.button || !this.flight) return;
    const running = this.flight.isRunning();
    this.button.title = running ? STOP_TITLE : START_TITLE;
    this.button.setAttribute('aria-pressed', String(running));
  }
}
