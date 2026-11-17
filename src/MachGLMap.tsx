import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IControl, Map as MaplibreMap } from 'maplibre-gl';
import { CircleFlightControl } from './lib/circle-flight-control';
import { TourControl } from './lib/tour-control';
import { addPlateauBuildings, type PlateauMap } from './lib/plateau';

// MachGL は選んだときだけ CDN から読む。MapLibre を使うときは読み込まない
// 読み込むと window.MachGL に地図・コントロール・PLATEAU の建物（type: "bld"）がそろう。API キーは src のクエリから読まれる
const MACH_GL_URL = 'https://cdn.geolonia.com/machgl/main/?geolonia-api-key=YOUR-API-KEY';

type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// MachGL は型定義を配っていないので、ここで使う分だけ書く。地図の API は MapLibre に合わせてある
interface MachMap {
  addControl(control: IControl, position?: ControlPosition): this;
  on(type: string, listener: () => void): this;
  getSource: PlateauMap['getSource'];
  getLayer: PlateauMap['getLayer'];
  addSource: PlateauMap['addSource'];
  addLayer: PlateauMap['addLayer'];
  setStyle(style: string): this;
  jumpTo(options: object): this;
  stop?: () => this;
  remove(): void;
}

interface MachGLGlobal {
  Map: new (options: {
    container: HTMLElement;
    style: string;
    lang?: string;
    center?: [number, number];
    zoom?: number;
    apiKey?: string;
    hash?: boolean | string;
    transformRequest?: (url: string) => { url: string } | undefined;
    stage?: string;
    navigationControl?: boolean | ControlPosition;
    errorMessage?: string | false;
  }) => MachMap;
  NavigationControl: new (options?: { visualizePitch?: boolean }) => IControl;
  FullscreenControl: new () => IControl;
  GeolocateControl: new () => IControl;
  ScaleControl: new () => IControl;
}

declare global {
  interface Window {
    MachGL?: MachGLGlobal;
  }
}

// ES モジュールではなく普通のスクリプトとして配られているので、script 要素で読む
let loading: Promise<MachGLGlobal> | undefined;
const loadMachGL = () => {
  loading ??= new Promise<MachGLGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MACH_GL_URL;
    script.async = true;
    // 失敗したら次に選び直したときに読み直せるよう、読み込み中の状態を捨てる
    const fail = (message: string) => {
      loading = undefined;
      script.remove();
      reject(new Error(message));
    };
    script.onload = () => (window.MachGL ? resolve(window.MachGL) : fail('window.MachGL がありません'));
    script.onerror = () => fail(`${MACH_GL_URL} を読み込めませんでした`);
    document.head.appendChild(script);
  });
  return loading;
};

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
  stage: string;
  center: [number, number];
  zoom: number;
  transformRequest: (url: string) => { url: string };
  onLoad: (map: MaplibreMap) => void;
  children: React.ReactNode;
};

const MachGLMap: React.FC<Props> = ({ style, lang, stage, center, zoom, transformRequest, onLoad, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MachMap>();
  const [ panel, setPanel ] = useState<HTMLElement>();
  const [ error, setError ] = useState<string>();

  // 地図は最初の 1 回だけ作る。スタイルの変更は下の effect で setStyle に渡す
  // stage を変えるとページを読み直すので、作るときに渡せば足りる
  const initialRef = useRef({ style, lang, stage, center, zoom, transformRequest, onLoad });

  useEffect(() => {
    let cancelled = false;

    let loaded = false;
    loadMachGL().then((mach) => {
      loaded = true;
      if (cancelled || !containerRef.current) return;
      // 読み込みを待つ間に変わったスタイルも拾えるよう、作る直前に読む
      const { style, lang, stage, center, zoom, transformRequest, onLoad } = initialRef.current;

      const map = new mach.Map({
        container: containerRef.current,
        style,
        lang,
        center,
        zoom,
        apiKey: 'YOUR-API-KEY',
        hash: 'map',
        transformRequest,
        stage,
        // 既定ではズームのボタンを自分で置くので止め、下でほかのコントロールと同じ順に置く
        navigationControl: false,
        // 作れなかったとき（WebGL2 が使えないなど）に MachGL が出す案内は止め、こちらのエラーと設定パネルを出す
        errorMessage: false,
      });
      mapRef.current = map;

      // MachGL には MapLibre の stop() が無い。動いているカメラは jumpTo で止まるので、サークル飛行とツアーが使う stop() をそれで補う
      if (typeof map.stop !== 'function') {
        map.stop = () => map.jumpTo({});
      }

      // MapLibre のときと同じ順に置く
      map.addControl(new mach.FullscreenControl(), 'top-right');
      map.addControl(new mach.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new mach.GeolocateControl(), 'top-right');
      map.addControl(new CircleFlightControl(), 'top-right');
      map.addControl(new TourControl(), 'top-right');
      map.addControl(new mach.ScaleControl(), 'bottom-right');

      const panelControl = new PanelControl();
      map.addControl(panelControl, 'top-left');
      setPanel(panelControl.container);

      // 検索の処理は MapLibre と同じ API で書いてあるので、そのまま渡す
      // MachGL の getStyle() はスタイルの metadata を返さないので、メタデータにあるズームの上限と下限は MachGL では効かない
      map.on('load', () => onLoad(map as unknown as MaplibreMap));
      // 建物は PLATEAU の 3D 都市モデルで立てる。ベースマップの押し出した建物（visible-on-3d）は重なるので出さない
      map.on('style.load', () => addPlateauBuildings(map));
    }).catch((err: unknown) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error(err);
      setError(`${loaded ? 'MachGL で地図を表示できませんでした' : 'MachGL を読み込めませんでした'}: ${String(err)}`);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (style === initialRef.current.style) return;
    initialRef.current.style = style;
    mapRef.current?.setStyle(style);
  }, [style]);

  return (
    <div style={{ width: '100vw', height: '100%' }}>
      {/* MachGL は地図を作れなかったときも、この中に canvas などを残す。エラーと設定パネルはその外に描く */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: error ? 'none' : undefined }} />
      {/* 読み込めなくても MapLibre に戻せるよう、設定パネルは出しておく */}
      {error && (
        <div style={{ padding: '1em' }}>
          <p role="alert">{error}</p>
          {children}
        </div>
      )}
      {/* @types/react-dom が別の版の @types/react を抱えていて ReactPortal の型が合わないので、型だけ合わせる */}
      {panel && (createPortal(children, panel) as unknown as React.ReactNode)}
    </div>
  );
};

export default MachGLMap;
