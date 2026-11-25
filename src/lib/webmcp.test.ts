import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCameraAnimation, type CameraAnimation } from './camera-animations';
import { createMapTools, registerMapTools, type MapToolDeps, type McpTool } from './webmcp';

const osaka = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { name: '大阪市役所' }, geometry: { type: 'Point' as const, coordinates: [135.5023, 34.6937] } },
    { type: 'Feature' as const, properties: { index: '北緯34.7°, 東経135.5°' }, geometry: { type: 'Point' as const, coordinates: [135.5, 34.7] } },
  ],
};

// 動いている間は isMoving が true で、止まると moveend を出す地図
const createDeps = (overrides: Partial<MapToolDeps> = {}) => {
  let moving = false;
  const listeners = new Set<() => void>();
  const finishMove = () => {
    moving = false;
    [...listeners].forEach((listener) => listener());
  };
  const animated = () => vi.fn((_options?: unknown) => {
    moving = true;
    setTimeout(finishMove, 0);
  });
  const map = {
    getZoom: () => 14.234,
    getCenter: () => ({ lng: 139.767123456, lat: 35.681234567 }),
    getBearing: () => 30.04,
    getPitch: () => 45.4,
    jumpTo: vi.fn(),
    flyTo: animated(),
    easeTo: animated(),
    isMoving: () => moving,
    on: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    off: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    getSource: vi.fn(),
    addSource: vi.fn(),
    getLayer: vi.fn(),
    addLayer: vi.fn(),
    fitBounds: vi.fn(),
  };
  const deps: MapToolDeps = {
    getMap: () => map,
    getStyle: () => 'geolonia/basic-v2',
    setStyle: vi.fn(),
    getLanguage: () => 'auto',
    getRenderer: () => 'maplibre',
    search: vi.fn(async () => osaka),
    ...overrides,
  };
  return { map, deps };
};

const findTool = (tools: McpTool[], name: string) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
};

const createAnimation = (running = false): CameraAnimation & { running: boolean } => {
  const animation = {
    running,
    start: vi.fn(() => { animation.running = true; }),
    stop: vi.fn(() => { animation.running = false; }),
    isRunning: () => animation.running,
  };
  return animation;
};

const unregisters: (() => void)[] = [];
const register = (name: string, animation: CameraAnimation) => {
  unregisters.push(registerCameraAnimation(name, animation));
};
afterEach(() => {
  unregisters.splice(0).forEach((unregister) => unregister());
});

describe('get_map_state', () => {
  it('is read-only and returns the camera, style, language, renderer and what is moving the camera', async () => {
    const { deps } = createDeps();
    register('tour', createAnimation(true));
    const tool = findTool(createMapTools(deps), 'get_map_state');

    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(JSON.parse(await tool.execute({}))).toEqual({
      center: { lat: 35.68123, lng: 139.76712 },
      zoom: 14.23,
      bearing: 30,
      pitch: 45,
      style: 'geolonia/basic-v2',
      language: 'auto',
      renderer: 'maplibre',
      circleFlight: false,
      landmarkTour: true,
    });
  });

  it('says why it failed, as text the model can read, while the map is not ready', async () => {
    const { deps } = createDeps({ getMap: () => undefined });
    const tool = findTool(createMapTools(deps), 'get_map_state');

    await expect(tool.execute({})).resolves.toMatch(/^エラー: .*地図/);
  });
});

describe('list_map_styles', () => {
  it('is read-only and lists every style of the settings panel in its groups with the current one', async () => {
    const { deps } = createDeps({ getStyle: () => 'geolonia/gsi' });
    const tool = findTool(createMapTools(deps), 'list_map_styles');

    const result = JSON.parse(await tool.execute({}));

    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(result.current).toBe('geolonia/gsi');
    expect(result.groups.map((g: { group: string }) => g.group)).toEqual(
      ['標準スタイル', 'SmartCity用スタイル', 'その他', 'EXPERIMENTAL | 実験的'],
    );
    expect(result.groups[0].styles[1]).toEqual({ id: 'geolonia/gsi', name: 'GSI' });
  });
});

describe('set_map_style', () => {
  it('offers exactly the styles that list_map_styles lists', async () => {
    const { deps } = createDeps();
    const tools = createMapTools(deps);
    const schema = findTool(tools, 'set_map_style').inputSchema as { properties: { style: { enum: string[] } } };
    const listed = JSON.parse(await findTool(tools, 'list_map_styles').execute({}))
      .groups.flatMap((g: { styles: { id: string }[] }) => g.styles.map((s) => s.id));

    expect(schema.properties.style.enum).toEqual(listed);
    expect(listed).toContain('geoloniamaps/smartcity-base');
  });

  it('switches to a style of the list, including one given as a URL', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'set_map_style');

    await expect(tool.execute({ style: 'geolonia/midnight' })).resolves.toContain('Midnight');
    await tool.execute({ style: 'https://geolonia.github.io/openstreetmap-carto/style.json' });

    expect(deps.setStyle).toHaveBeenNthCalledWith(1, 'geolonia/midnight');
    expect(deps.setStyle).toHaveBeenNthCalledWith(2, 'https://geolonia.github.io/openstreetmap-carto/style.json');
  });

  it('rejects a style that is not in the list, so a URL from the model never reaches the map', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'set_map_style');

    await expect(tool.execute({ style: 'https://example.com/style.json' })).resolves.toMatch(/^エラー: style は/);
    await expect(tool.execute({})).resolves.toMatch(/^エラー: style を指定/);
    expect(deps.setStyle).not.toHaveBeenCalled();
  });
});

describe('move_map', () => {
  it('flies by default, waits until the camera stops and then reports where it is', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    const result = await tool.execute({ lat: 34.6937, lng: 135.5023, zoom: 16 });

    expect(map.flyTo).toHaveBeenCalledWith({ center: [135.5023, 34.6937], zoom: 16, duration: undefined, essential: true });
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(result).toContain('（fly）');
    expect(result).toContain('"zoom":14.23');
    expect(map.off).toHaveBeenCalled();
  });

  it('passes the duration and uses easeTo for ease', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await tool.execute({ bearing: 90, animation: 'ease', duration: 3000 });

    expect(map.easeTo).toHaveBeenCalledWith({ bearing: 90, duration: 3000, essential: true });
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('jumps without waiting when asked to', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await tool.execute({ bearing: 90, pitch: 60, animation: 'jump' });

    expect(map.jumpTo).toHaveBeenCalledWith({ bearing: 90, pitch: 60 });
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.on).not.toHaveBeenCalled();
  });

  it('falls back to easeTo when the map has no flyTo', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools({ ...deps, getMap: () => ({ ...map, flyTo: undefined }) }), 'move_map');

    await tool.execute({ zoom: 10 });

    expect(map.easeTo).toHaveBeenCalled();
  });

  it('stops the circle flight and the tour so that they do not keep moving the camera', async () => {
    const { deps } = createDeps();
    const flight = createAnimation(true);
    const tour = createAnimation(false);
    register('circle-flight', flight);
    register('tour', tour);

    await findTool(createMapTools(deps), 'move_map').execute({ zoom: 10 });

    expect(flight.stop).toHaveBeenCalledTimes(1);
    expect(tour.stop).not.toHaveBeenCalled();
  });

  it('gives up waiting after the time limit and says the camera is still moving', async () => {
    vi.useFakeTimers();
    try {
      const { deps, map } = createDeps();
      map.flyTo = vi.fn((_options?: unknown) => { map.isMoving = () => true; });
      const pending = findTool(createMapTools(deps), 'move_map').execute({ zoom: 10, duration: 1000 });

      await vi.advanceTimersByTimeAsync(4000);

      await expect(pending).resolves.toContain('まだ移動中');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a latitude without a longitude', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute({ lat: 35 })).resolves.toMatch(/^エラー: lat と lng/);
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it.each([
    [{ lat: 91, lng: 0 }, 'lat'],
    [{ lat: 0, lng: 181 }, 'lng'],
    [{ zoom: 25 }, 'zoom'],
    [{ zoom: -1 }, 'zoom'],
    [{ pitch: 90 }, 'pitch'],
    [{ lat: 'x', lng: 0 }, 'lat'],
    [{ zoom: 5, duration: 99999 }, 'duration'],
    [{ zoom: 5, animation: 'teleport' }, 'animation'],
  ])('rejects invalid input %j', async (input, field) => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute(input)).resolves.toMatch(new RegExp(`^エラー: ${field}`));
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('rejects an empty request', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute({})).resolves.toMatch(/^エラー: .*少なくとも/);
  });
});

describe('search_places', () => {
  it('marks its results as untrusted because the names come from outside', () => {
    const { deps } = createDeps();

    expect(findTool(createMapTools(deps), 'search_places').annotations?.untrustedContentHint).toBe(true);
  });

  it('searches, waits for the camera to settle and returns the places with the state of the map', async () => {
    const { deps, map } = createDeps();
    // 検索は結果に寄るために地図を動かす
    const search = vi.fn(async (_map: unknown, _query: string) => {
      map.easeTo({});
      return osaka;
    });

    const result = JSON.parse(await findTool(createMapTools({ ...deps, search }), 'search_places').execute({ query: ' 大阪市役所 ' }));

    expect(search).toHaveBeenCalledWith(map, '大阪市役所');
    expect(result.total).toBe(2);
    expect(result.results).toEqual([
      { name: '大阪市役所', lat: 34.6937, lng: 135.5023 },
      { name: '北緯34.7°, 東経135.5°', lat: 34.7, lng: 135.5 },
    ]);
    expect(result.state.zoom).toBe(14.23);
  });

  it('returns at most 10 places', async () => {
    const many = {
      type: 'FeatureCollection' as const,
      features: Array.from({ length: 30 }, (_, i) => ({
        type: 'Feature' as const, properties: { name: `place ${i}` }, geometry: { type: 'Point' as const, coordinates: [i, i] },
      })),
    };
    const { deps } = createDeps({ search: vi.fn(async () => many) });

    const result = JSON.parse(await findTool(createMapTools(deps), 'search_places').execute({ query: 'x' }));

    expect(result.total).toBe(30);
    expect(result.results).toHaveLength(10);
  });

  it('reports a failure of the search as text', async () => {
    const { deps } = createDeps({ search: vi.fn(async () => { throw new Error('検索に失敗しました'); }) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(findTool(createMapTools(deps), 'search_places').execute({ query: 'x' })).resolves.toBe('エラー: 検索に失敗しました');
  });

  it.each([[{}], [{ query: '' }], [{ query: '   ' }], [{ query: 'x'.repeat(201) }], [{ query: 5 }]])('rejects the query %j', async (input) => {
    const { deps } = createDeps();

    await expect(findTool(createMapTools(deps), 'search_places').execute(input)).resolves.toMatch(/^エラー: query/);
    expect(deps.search).not.toHaveBeenCalled();
  });
});

describe.each([
  ['circle_flight', 'circle-flight'],
  ['landmark_tour', 'tour'],
])('%s', (toolName, key) => {
  it('starts and stops the same animation as the button', async () => {
    const { deps } = createDeps();
    const animation = createAnimation();
    register(key, animation);
    const tool = findTool(createMapTools(deps), toolName);

    await expect(tool.execute({ action: 'start' })).resolves.toContain('開始しました');
    expect(animation.start).toHaveBeenCalledTimes(1);
    await expect(tool.execute({ action: 'start' })).resolves.toBe('すでに動いています');
    expect(animation.start).toHaveBeenCalledTimes(1);

    await expect(tool.execute({ action: 'stop' })).resolves.toBe('停止しました');
    expect(animation.stop).toHaveBeenCalledTimes(1);
    await expect(tool.execute({ action: 'stop' })).resolves.toBe('動いていません');
  });

  it('rejects an unknown action', async () => {
    const { deps } = createDeps();
    register(key, createAnimation());

    await expect(findTool(createMapTools(deps), toolName).execute({ action: 'pause' })).resolves.toMatch(/^エラー: action/);
  });

  it('says so while the map is not ready', async () => {
    const { deps } = createDeps();

    await expect(findTool(createMapTools(deps), toolName).execute({ action: 'start' })).resolves.toMatch(/^エラー: .*地図/);
  });
});

describe('registerMapTools', () => {
  it('does nothing when the browser has no WebMCP', () => {
    const { deps } = createDeps();

    expect(registerMapTools({} as Document, deps)).toBeUndefined();
  });

  it('registers every tool and unregisters them through one signal', () => {
    const { deps } = createDeps();
    const registerTool = vi.fn();
    const doc = { modelContext: { registerTool } } as unknown as Document;

    const unregister = registerMapTools(doc, deps);

    expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
      'get_map_state', 'list_map_styles', 'set_map_style', 'move_map', 'search_places', 'circle_flight', 'landmark_tour',
    ]);
    const signals = registerTool.mock.calls.map(([, options]) => options.signal as AbortSignal);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);

    unregister?.();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('keeps going when the browser rejects one tool', () => {
    const { deps } = createDeps();
    const registerTool = vi.fn().mockImplementationOnce(() => { throw new Error('duplicate'); });
    const doc = { modelContext: { registerTool } } as unknown as Document;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerMapTools(doc, deps);

    expect(registerTool).toHaveBeenCalledTimes(7);
  });
});
