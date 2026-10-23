import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { CircleFlight } from './circle-flight';

const START_LABEL = 'サークル飛行を開始';
const STOP_LABEL = 'サークル飛行を停止';

// サークル飛行を開始・停止するボタン。MapLibre の標準コントロールと同じ見た目にする
export class CircleFlightControl implements IControl {
  private container?: HTMLElement;
  private button?: HTMLButtonElement;
  private flight?: CircleFlight;

  onAdd(map: MaplibreMap) {
    this.flight = new CircleFlight(map, () => this.render());

    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-circle-flight';
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
    this.flight?.stop();
    this.container?.remove();
    this.container = undefined;
    this.button = undefined;
    this.flight = undefined;
  }

  private toggle = () => {
    if (!this.flight) return;
    if (this.flight.isRunning()) {
      this.flight.stop();
    } else {
      this.flight.start();
    }
    this.render();
  };

  private render() {
    if (!this.button || !this.flight) return;
    const running = this.flight.isRunning();
    const label = running ? STOP_LABEL : START_LABEL;
    this.button.title = label;
    this.button.setAttribute('aria-label', label);
    this.button.setAttribute('aria-pressed', String(running));
  }
}
