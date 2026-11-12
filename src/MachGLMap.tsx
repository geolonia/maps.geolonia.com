import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { CircleFlightControl } from './lib/circle-flight-control';
import { applyThreeDVisibility, type ThreeDMap } from './lib/three-d';

// リリース前のため、0.x の最新を CDN から読む。MapLibre を使うときは読み込まない
const MACH_GL_BASE = 'https://cdn.geolonia.com/mach-gl/v0/';

type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// MachGL は型定義を配っていないので、ここで使う分だけ書く。地図の API は MapLibre に合わせてある
interface MachMap {
  addControl(control: IControl, position?: ControlPosition): this;
  on(type: string, listener: () => void): this;
  getStyle(): ReturnType<ThreeDMap['getStyle']>;
  setLayoutProperty: ThreeDMap['setLayoutProperty'];
  setStyle(style: string): this;
  jumpTo(options: object): this;
  stop?: () => this;
  remove(): void;
}

interface MachGLModule {
  Map: new (options: {
    container: HTMLElement;
    style: string;
    lang?: string;
    center?: [number, number];
    zoom?: number;
    apiKey?: string;
    hash?: boolean | string;
    transformRequest?: (url: string) => { url: string } | undefined;
  }) => MachMap;
  NavigationControl: new (options?: { visualizePitch?: boolean }) => IControl;
}

interface MachGLControlsModule {
  FullscreenControl: new () => IControl;
  GeolocateControl: new () => IControl;
  ScaleControl: new () => IControl;
}

// React の子要素を描くための入れ物を、地図のコントロールとして置く
class PanelControl implements IControl {
  readonly container = document.createElement('div');

  onAdd() {
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }
}

type Props = {
  style: string;
  lang: string;
  center: [number, number];
  zoom: number;
  transformRequest: (url: string) => { url: string };
  onLoad: (map: MaplibreMap) => void;
  children: React.ReactNode;
};

const MachGLMap: React.FC<Props> = ({ style, lang, center, zoom, transformRequest, onLoad, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MachMap>();
  const [ panel, setPanel ] = useState<HTMLElement>();
  const [ error, setError ] = useState<string>();

  // 地図は最初の 1 回だけ作る。スタイルの変更は下の effect で setStyle に渡す
  const initialRef = useRef({ style, lang, center, zoom, transformRequest, onLoad });

  useEffect(() => {
    let cancelled = false;
    const { style, lang, center, zoom, transformRequest, onLoad } = initialRef.current;

    Promise.all([
      import(/* @vite-ignore */ `${MACH_GL_BASE}mach-gl.js`) as Promise<MachGLModule>,
      import(/* @vite-ignore */ `${MACH_GL_BASE}controls.js`) as Promise<MachGLControlsModule>,
    ]).then(([ mach, controls ]) => {
      if (cancelled || !containerRef.current) return;

      const map = new mach.Map({
        container: containerRef.current,
        style,
        lang,
        center,
        zoom,
        apiKey: 'YOUR-API-KEY',
        hash: 'map',
        transformRequest,
      });
      mapRef.current = map;

      // MachGL には MapLibre の stop() が無い。動いているカメラは jumpTo で止まるので、サークル飛行が使う stop() をそれで補う
      if (typeof map.stop !== 'function') {
        map.stop = () => map.jumpTo({});
      }

      // MapLibre のときと同じ順に置く
      map.addControl(new controls.FullscreenControl(), 'top-right');
      map.addControl(new mach.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new controls.GeolocateControl(), 'top-right');
      map.addControl(new CircleFlightControl(), 'top-right');
      map.addControl(new controls.ScaleControl(), 'bottom-right');

      const panelControl = new PanelControl();
      map.addControl(panelControl, 'top-left');
      setPanel(panelControl.container);

      // 検索やスタイルのメタデータの処理は MapLibre と同じ API で書いてあるので、そのまま渡す
      map.on('load', () => onLoad(map as unknown as MaplibreMap));
      // MapLibre 側は maps-core の 3d で建物を立てているので、スタイルを読むたびに同じことをする
      map.on('style.load', () => applyThreeDVisibility(map));
    }).catch((err: unknown) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error(err);
      setError(`MachGL を読み込めませんでした: ${String(err)}`);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || style === initialRef.current.style) return;
    initialRef.current.style = style;
    map.setStyle(style);
  }, [style]);

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100%' }}>
      {error && <p role="alert" style={{ padding: '1em' }}>{error}</p>}
      {/* @types/react-dom が別の版の @types/react を抱えていて ReactPortal の型が合わないので、型だけ合わせる */}
      {panel && (createPortal(children, panel) as unknown as React.ReactNode)}
    </div>
  );
};

export default MachGLMap;
