import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { Tour } from './tour';

// 読み上げでは押されているかを aria-pressed で伝えるので、名前は変えない。変わるのはマウスを載せたときの説明だけにする
const LABEL = 'ツアー';
const START_TITLE = 'ツアーを開始';
const STOP_TITLE = 'ツアーを停止';

// 東京の名所を巡るツアーを開始・停止するボタン。MapLibre の標準コントロールと同じ見た目にする
export class TourControl implements IControl {
  private container?: HTMLElement;
  private button?: HTMLButtonElement;
  private tour?: Tour;

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
    return this.container;
  }

  onRemove() {
    this.tour?.stop();
    this.container?.remove();
    this.container = undefined;
    this.button = undefined;
    this.tour = undefined;
  }

  private toggle = () => {
    if (!this.tour) return;
    if (this.tour.isRunning()) {
      this.tour.stop();
    } else {
      this.tour.start();
    }
    this.render();
  };

  private render() {
    if (!this.button || !this.tour) return;
    const running = this.tour.isRunning();
    this.button.title = running ? STOP_TITLE : START_TITLE;
    this.button.setAttribute('aria-pressed', String(running));
  }
}
