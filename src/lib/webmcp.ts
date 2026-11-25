import { getCameraAnimation, stopCameraAnimations } from './camera-animations';
import { formatPosition, type CameraState } from './position';
import { searchPlaces, type SearchMap } from './search';
import { ALL_STYLES, STYLE_GROUPS } from './style';

// WebMCP は提案段階の Web 標準で、TypeScript の lib.dom にはまだ型が無い。ここで使う分だけ書く
// see: https://developer.chrome.com/docs/ai/webmcp
export type McpTool = {
  name: string
  description: string
  inputSchema: object
  annotations?: { readOnlyHint?: boolean, untrustedContentHint?: boolean, consequentialHint?: boolean }
  // 戻り値はモデルに渡る文字列。失敗は「エラー: 理由」の文字列で返す
  execute: (input: Record<string, unknown>) => Promise<string>
};

type ModelContextLike = {
  registerTool: (tool: McpTool, options?: { signal?: AbortSignal }) => unknown
};

type CameraOptions = { center?: [number, number], zoom?: number, bearing?: number, pitch?: number };
type AnimatedCameraOptions = CameraOptions & { duration?: number, essential?: boolean };

export type McpMap = CameraState & SearchMap & {
  jumpTo: (options: CameraOptions) => unknown
  // MachGL に flyTo があるかは分からないので、無ければ easeTo、それも無ければ jumpTo にする
  flyTo?: (options: AnimatedCameraOptions) => unknown
  easeTo?: (options: AnimatedCameraOptions) => unknown
  isMoving?: () => boolean
  on: (type: 'moveend', listener: () => void) => unknown
  off: (type: 'moveend', listener: () => void) => unknown
};

export type MapToolDeps = {
  // 地図は読み込みが終わるまで無いので、使うたびに取りにいく
  getMap: () => McpMap | undefined
  getStyle: () => string
  setStyle: (style: string) => void
  getLanguage: () => string
  getRenderer: () => string
  // テストで差し替えられるようにする。画面の検索ボックスと同じ処理が既定
  search?: typeof searchPlaces
};

const MAX_ZOOM = 22;
// MapLibre の既定の上限は 60 度だが、v6 は 85 度まで設定できる
const MAX_PITCH = 85;
const MAX_DURATION = 60_000;
// flyTo は距離に応じて長くなる。それでも終わらないときは待つのをやめて、今の状態を返す
const DEFAULT_WAIT = 20_000;
const WAIT_MARGIN = 3_000;
// モデルに返す文字数の目安（公式ドキュメントの推奨は 1.5K 文字）
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 200;

// 理由をモデルに届けるための失敗。execute の中で投げ、最後に「エラー: 理由」の文字列にする
class ToolError extends Error {}

// throw されたエラーの理由は、呼び出し側には「Tool execution failed.」としか届かない（Chrome Canary 160 で確認）。
// モデルが直して再試行できるよう、理由は戻り値の文字列で返す
const withErrorText = (run: (input: Record<string, unknown>) => Promise<string>) => async (input: Record<string, unknown>) => {
  try {
    return await run(input);
  } catch (err) {
    if (!(err instanceof ToolError)) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
    return `エラー: ${err instanceof Error ? err.message : String(err)}`;
  }
};

const requireMap = (deps: MapToolDeps) => {
  const map = deps.getMap();
  if (!map) throw new ToolError('地図はまだ読み込み中です。しばらくしてからやり直してください');
  return map;
};

// 入力は文字列や NaN が来うる。範囲の外は地図に渡さず、どの項目が悪いかを返す
const readNumber = (input: Record<string, unknown>, key: string, min: number, max: number) => {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ToolError(`${key} は ${min} から ${max} の数値で指定してください`);
  }
  return value;
};

const readChoice = <T extends string>(input: Record<string, unknown>, key: string, choices: readonly T[]): T | undefined => {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new ToolError(`${key} は ${choices.join(', ')} のどれかで指定してください`);
  }
  return value as T;
};

const round = (value: number) => Math.round(value * 100) / 100;

const describeState = (deps: MapToolDeps, map: McpMap) => {
  const zoom = map.getZoom();
  const { lat, lng } = formatPosition(map.getCenter(), zoom);
  return {
    center: { lat, lng },
    zoom: round(zoom),
    bearing: Math.round(map.getBearing()),
    pitch: Math.round(map.getPitch()),
    style: deps.getStyle(),
    language: deps.getLanguage(),
    renderer: deps.getRenderer(),
    // 動いていると地図の位置は刻々と変わるので、どの機能が動かしているかも返す
    circleFlight: getCameraAnimation('circle-flight')?.isRunning() ?? false,
    landmarkTour: getCameraAnimation('tour')?.isRunning() ?? false,
  };
};

// アニメーションが終わるまで待つ。終わる前に呼び出しが返ると、モデルは移動中の位置を「到着した場所」と取り違える。
// 瞬間移動（jumpTo）や、動かなかったときは待たない。動いているかを知らない地図では、moveend か時間切れまで待つ
const waitForCamera = (map: McpMap, timeout: number) => new Promise<void>((resolve) => {
  if (map.isMoving && !map.isMoving()) {
    resolve();
    return;
  }
  const done = () => {
    clearTimeout(timer);
    map.off('moveend', done);
    resolve();
  };
  const timer = setTimeout(done, timeout);
  map.on('moveend', done);
});

const stillMovingNote = (map: McpMap) => (map.isMoving?.() ? '（まだ移動中です。位置は途中のものです）' : '');

const getMapState = (deps: MapToolDeps): McpTool => ({
  name: 'get_map_state',
  description: '今の地図の中心座標、ズーム、方位、傾き、スタイル、言語、描画ライブラリと、サークル飛行やツアーが動いているかを返す。',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: withErrorText(async () => JSON.stringify(describeState(deps, requireMap(deps)))),
});

const listMapStyles = (deps: MapToolDeps): McpTool => ({
  name: 'list_map_styles',
  description: '選べる地図スタイルの一覧と、今のスタイルを返す。set_map_style にはここにある id を渡す。',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: withErrorText(async () => JSON.stringify({
    current: deps.getStyle(),
    groups: STYLE_GROUPS.map(({ label, styles }) => ({ group: label, styles: styles.map(({ value, label: name }) => ({ id: value, name })) })),
  })),
});

const setMapStyle = (deps: MapToolDeps): McpTool => {
  const ids = ALL_STYLES.map(({ value }) => value);
  return {
    name: 'set_map_style',
    description: '地図のスタイルを切り替える。選べるスタイルは list_map_styles で調べる。',
    inputSchema: {
      type: 'object',
      properties: { style: { type: 'string', enum: ids, description: 'list_map_styles が返す id' } },
      required: ['style'],
    },
    execute: withErrorText(async (input) => {
      // スタイルの URL は地図がそのまま読むので、モデルから任意の URL を渡せないよう、一覧にあるものだけ通す
      const style = readChoice(input, 'style', ids);
      if (style === undefined) throw new ToolError('style を指定してください。選べるスタイルは list_map_styles で調べられます');
      deps.setStyle(style);
      const name = ALL_STYLES.find(({ value }) => value === style)?.label ?? style;
      return `スタイルを ${name}（${style}）に切り替えました`;
    }),
  };
};

const ANIMATIONS = ['fly', 'ease', 'jump'] as const;

const moveMap = (deps: MapToolDeps): McpTool => ({
  name: 'move_map',
  description: '地図を移動する。lat と lng は両方そろえて指定する。zoom、bearing、pitch は指定した項目だけ変える。'
    + '見ている人が何が起きたか分かるよう、既定ではアニメーション（fly）で移動し、着いてから今の状態を返す。',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: '緯度（-90 から 90）' },
      lng: { type: 'number', description: '経度（-180 から 180）' },
      zoom: { type: 'number', description: `ズーム（0 から ${MAX_ZOOM}）` },
      bearing: { type: 'number', description: '方位（度。0 が北）' },
      pitch: { type: 'number', description: `傾き（0 から ${MAX_PITCH} 度）` },
      animation: {
        type: 'string',
        enum: [...ANIMATIONS],
        description: 'fly は引いてから寄る飛行（既定）、ease はまっすぐ滑らかに、jump は瞬間移動',
      },
      duration: { type: 'number', description: `アニメーションの長さ（ミリ秒。0 から ${MAX_DURATION}）。省略すると距離に合わせる` },
    },
  },
  execute: withErrorText(async (input) => {
    const lat = readNumber(input, 'lat', -90, 90);
    const lng = readNumber(input, 'lng', -180, 180);
    const zoom = readNumber(input, 'zoom', 0, MAX_ZOOM);
    const bearing = readNumber(input, 'bearing', -360, 360);
    const pitch = readNumber(input, 'pitch', 0, MAX_PITCH);
    const duration = readNumber(input, 'duration', 0, MAX_DURATION);
    const animation = readChoice(input, 'animation', ANIMATIONS) ?? 'fly';
    if ((lat === undefined) !== (lng === undefined)) {
      throw new ToolError('lat と lng は両方そろえて指定してください');
    }
    const camera: CameraOptions = {};
    if (lat !== undefined && lng !== undefined) camera.center = [lng, lat];
    if (zoom !== undefined) camera.zoom = zoom;
    if (bearing !== undefined) camera.bearing = bearing;
    if (pitch !== undefined) camera.pitch = pitch;
    if (Object.keys(camera).length === 0) {
      throw new ToolError('lat と lng、zoom、bearing、pitch のうち少なくとも 1 つを指定してください');
    }

    const map = requireMap(deps);
    // サークル飛行やツアーが動いたままだと、移動の後も回り続けて、着いた場所が分からなくなる
    stopCameraAnimations();
    const animate = animation === 'fly' ? (map.flyTo ?? map.easeTo) : animation === 'ease' ? map.easeTo : undefined;
    if (animate) {
      // 動きを減らす OS の設定でも、頼まれた移動なので essential にする
      animate.call(map, { ...camera, duration, essential: true });
      // easeTo は動いているカメラの moveend をその場で出すので、移動を始めてから待ち始める
      await waitForCamera(map, (duration ?? DEFAULT_WAIT) + WAIT_MARGIN);
    } else {
      map.jumpTo(camera);
    }
    return `地図を移動しました（${animation}）${stillMovingNote(map)}。今の状態: ${JSON.stringify(describeState(deps, map))}`;
  }),
});

const searchPlacesTool = (deps: MapToolDeps): McpTool => ({
  name: 'search_places',
  description: '地名や住所、または緯度経度を検索し、結果を地図に表示して結果が収まるところまで移動する。地図の中心に近い場所が上位に出る。',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: '地名、住所、または「35.68, 139.76」のような緯度経度' } },
    required: ['query'],
  },
  // 結果の名前は外部のデータ（OpenStreetMap など）なので、信頼できない内容として扱わせる
  annotations: { untrustedContentHint: true },
  execute: withErrorText(async (input) => {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (query === '' || query.length > MAX_QUERY_LENGTH) {
      throw new ToolError(`query は 1 から ${MAX_QUERY_LENGTH} 文字の文字列で指定してください`);
    }
    const map = requireMap(deps);
    stopCameraAnimations();
    const data = await (deps.search ?? searchPlaces)(map, query);
    // 寄る動きが終わってから返す。動かない結果（0 件など）では待たない
    await waitForCamera(map, DEFAULT_WAIT + WAIT_MARGIN);

    const results = data.features.flatMap((feature) => {
      if (feature.geometry.type !== 'Point') return [];
      const [lng, lat] = feature.geometry.coordinates;
      const properties = feature.properties ?? {};
      const name = properties.name ?? properties.index;
      return [{ name: typeof name === 'string' ? name : undefined, lat, lng }];
    });
    return JSON.stringify({ total: results.length, results: results.slice(0, MAX_RESULTS), state: describeState(deps, map) });
  }),
});

const ACTIONS = ['start', 'stop'] as const;

// サークル飛行とツアーは、画面のボタンと同じ実体を動かす
const cameraAnimationTool = (options: {
  name: string
  key: string
  description: string
  startedText: string
}): McpTool => ({
  name: options.name,
  description: options.description,
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', enum: [...ACTIONS], description: 'start で開始、stop で停止' } },
    required: ['action'],
  },
  execute: withErrorText(async (input) => {
    const action = readChoice(input, 'action', ACTIONS);
    if (action === undefined) throw new ToolError('action を start か stop で指定してください');
    const animation = getCameraAnimation(options.key);
    if (!animation) throw new ToolError('地図はまだ読み込み中です。しばらくしてからやり直してください');
    if (action === 'stop') {
      if (!animation.isRunning()) return '動いていません';
      animation.stop();
      return '停止しました';
    }
    if (animation.isRunning()) return 'すでに動いています';
    animation.start();
    return options.startedText;
  }),
});

export const createMapTools = (deps: MapToolDeps): McpTool[] => [
  getMapState(deps),
  listMapStyles(deps),
  setMapStyle(deps),
  moveMap(deps),
  searchPlacesTool(deps),
  cameraAnimationTool({
    name: 'circle_flight',
    key: 'circle-flight',
    description: '今の中心を軸にカメラを回し続ける（サークル飛行）。止めるまで続く。ほかの機能がカメラを動かすと止まる。',
    startedText: 'サークル飛行を開始しました。止めるには action に stop を指定してください',
  }),
  cameraAnimationTool({
    name: 'landmark_tour',
    key: 'tour',
    description: '東京の名所（東京タワー、フジテレビ、羽田空港、神宮球場、東京都庁、東京駅）を順に巡る。止めるまで続く。ほかの機能がカメラを動かすと止まる。',
    startedText: 'ツアーを開始しました。止めるには action に stop を指定してください',
  }),
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
