import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { registerCameraAnimation, type CameraAnimation } from './camera-animations';
import { Tour } from './tour';

// 読み上げでは押されているかを aria-pressed で伝えるので、名前は変えない。変わるのはマウスを載せたときの説明だけにする
const LABEL = 'ツアー';
const START_TITLE = 'ツアーを開始';
const STOP_TITLE = 'ツアーを停止';

// 東京の名所を巡るツアーを開始・停止するボタン。MapLibre の標準コントロールと同じ見た目にする
export class TourControl implements IControl, CameraAnimation {
  private container?: HTMLElement;
  private button?: HTMLButtonElement;
  private tour?: Tour;
  private unregister?: () => void;

  onAdd(map: MaplibreMap) {
    this.tour = new Tour(map, () => this.render());

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-tour';
    this.button.setAttribute('aria-label', LABEL);
    const icon = document.createElement('span');
    icon.className = 'maplibregl-ctrl-icon';
    icon.setAttribute('aria-hidden', 'true');
    this.button.appendChild(icon);
    this.button.addEventListener('click', this.toggle);
    this.container.appendChild(this.button);
    this.render();
    // WebMCP のツールも、このボタンと同じ実体を動かす
    this.unregister = registerCameraAnimation('tour', this);
    return this.container;
  }

  onRemove() {
    this.unregister?.();
    this.unregister = undefined;
    this.tour?.stop();
    this.container?.remove();
    this.container = undefined;
    this.button = undefined;
    this.tour = undefined;
  }

  isRunning() {
    return this.tour?.isRunning() ?? false;
  }

  start() {
    this.tour?.start();
    this.render();
  }

  stop() {
    this.tour?.stop();
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
    if (!this.button || !this.tour) return;
    const running = this.tour.isRunning();
    this.button.title = running ? STOP_TITLE : START_TITLE;
    this.button.setAttribute('aria-pressed', String(running));
  }
}
