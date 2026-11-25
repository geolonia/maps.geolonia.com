import { formatPosition, type CameraState } from './position';
import { STANDARD_STYLES } from './style';

// WebMCP は提案段階の Web 標準で、TypeScript の lib.dom にはまだ型が無い。ここで使う分だけ書く
// see: https://developer.chrome.com/docs/ai/webmcp
export type McpTool = {
  name: string
  description: string
  inputSchema: object
  annotations?: { readOnlyHint?: boolean, untrustedContentHint?: boolean, consequentialHint?: boolean }
  // 戻り値はモデルに渡る文字列。失敗は throw で返す
  execute: (input: Record<string, unknown>) => Promise<string>
};

type ModelContextLike = {
  registerTool: (tool: McpTool, options?: { signal?: AbortSignal }) => unknown
};

export type McpMap = CameraState & {
  jumpTo: (options: { center?: [number, number], zoom?: number, bearing?: number, pitch?: number }) => unknown
};

export type MapToolDeps = {
  // 地図は読み込みが終わるまで無いので、使うたびに取りにいく
  getMap: () => McpMap | undefined
  getStyle: () => string
  setStyle: (style: string) => void
  getLanguage: () => string
  getRenderer: () => string
};

const MAX_ZOOM = 22;
// MapLibre の既定の上限は 60 度だが、v6 は 85 度まで設定できる
const MAX_PITCH = 85;

const requireMap = (deps: MapToolDeps) => {
  const map = deps.getMap();
  if (!map) throw new Error('地図はまだ読み込み中です。しばらくしてからやり直してください');
  return map;
};

// 入力は文字列や NaN が来うる。範囲の外は地図に渡さず、どの項目が悪いかを返す
const readNumber = (input: Record<string, unknown>, key: string, min: number, max: number) => {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} は ${min} から ${max} の数値で指定してください`);
  }
  return value;
};

const round = (value: number) => Math.round(value * 100) / 100;

const getMapState = (deps: MapToolDeps): McpTool => ({
  name: 'get_map_state',
  description: '今の地図の中心座標、ズーム、方位、傾き、スタイル、言語、描画ライブラリを返す。',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const map = requireMap(deps);
    const zoom = map.getZoom();
    const { lat, lng } = formatPosition(map.getCenter(), zoom);
    return JSON.stringify({
      center: { lat, lng },
      zoom: round(zoom),
      bearing: Math.round(map.getBearing()),
      pitch: Math.round(map.getPitch()),
      style: deps.getStyle(),
      language: deps.getLanguage(),
      renderer: deps.getRenderer(),
    });
  },
});

const moveMap = (deps: MapToolDeps): McpTool => ({
  name: 'move_map',
  description: '地図を移動する。lat と lng は両方そろえて指定する。zoom、bearing、pitch は指定した項目だけ変える。',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: '緯度（-90 から 90）' },
      lng: { type: 'number', description: '経度（-180 から 180）' },
      zoom: { type: 'number', description: `ズーム（0 から ${MAX_ZOOM}）` },
      bearing: { type: 'number', description: '方位（度。0 が北）' },
      pitch: { type: 'number', description: `傾き（0 から ${MAX_PITCH} 度）` },
    },
  },
  execute: async (input) => {
    const lat = readNumber(input, 'lat', -90, 90);
    const lng = readNumber(input, 'lng', -180, 180);
    const zoom = readNumber(input, 'zoom', 0, MAX_ZOOM);
    const bearing = readNumber(input, 'bearing', -360, 360);
    const pitch = readNumber(input, 'pitch', 0, MAX_PITCH);
    if ((lat === undefined) !== (lng === undefined)) {
      throw new Error('lat と lng は両方そろえて指定してください');
    }
    const options: Parameters<McpMap['jumpTo']>[0] = {};
    if (lat !== undefined && lng !== undefined) options.center = [lng, lat];
    if (zoom !== undefined) options.zoom = zoom;
    if (bearing !== undefined) options.bearing = bearing;
    if (pitch !== undefined) options.pitch = pitch;
    if (Object.keys(options).length === 0) {
      throw new Error('lat と lng、zoom、bearing、pitch のうち少なくとも 1 つを指定してください');
    }

    const map = requireMap(deps);
    map.jumpTo(options);
    return `地図を移動しました: ${JSON.stringify(options)}`;
  },
});

const setMapStyle = (deps: MapToolDeps): McpTool => {
  const ids = STANDARD_STYLES.map(({ value }) => value);
  return {
    name: 'set_map_style',
    description: '地図のスタイルを切り替える。',
    inputSchema: {
      type: 'object',
      properties: {
        style: { type: 'string', enum: ids, description: ids.join(', ') },
      },
      required: ['style'],
    },
    execute: async (input) => {
      const style = input.style;
      // スタイルの URL は地図がそのまま読むので、モデルから任意の URL を渡せないよう、選択肢にあるものだけ通す
      if (typeof style !== 'string' || !ids.includes(style)) {
        throw new Error(`style は ${ids.join(', ')} のどれかで指定してください`);
      }
      deps.setStyle(style);
      return `スタイルを ${style} に切り替えました`;
    },
  };
};

export const createMapTools = (deps: MapToolDeps): McpTool[] => [
  getMapState(deps),
  moveMap(deps),
  setMapStyle(deps),
];

const getModelContext = (doc: Document): ModelContextLike | undefined => {
  const context = (doc as unknown as { modelContext?: ModelContextLike }).modelContext;
  return typeof context?.registerTool === 'function' ? context : undefined;
};

// WebMCP のあるブラウザでだけツールを登録し、解除する関数を返す。無いブラウザでは何もしない
export const registerMapTools = (doc: Document, deps: MapToolDeps): (() => void) | undefined => {
  const context = getModelContext(doc);
  if (!context) return undefined;

  const controller = new AbortController();
  const warn = (tool: McpTool, err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`WebMCP のツール ${tool.name} を登録できませんでした`, err);
  };
  for (const tool of createMapTools(deps)) {
    // 実験の API なので、1 つ登録できなくても残りは登録する。registerTool は同期で投げることも、Promise で失敗することもある
    try {
      Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch((err: unknown) => warn(tool, err));
    } catch (err) {
      warn(tool, err);
    }
  }
  return () => controller.abort();
};
