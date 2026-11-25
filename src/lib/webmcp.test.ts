import { describe, expect, it, vi } from 'vitest';
import { createMapTools, registerMapTools, type MapToolDeps, type McpTool } from './webmcp';

const createDeps = (overrides: Partial<MapToolDeps> = {}) => {
  const map = {
    getZoom: () => 14.234,
    getCenter: () => ({ lng: 139.767123456, lat: 35.681234567 }),
    getBearing: () => 30.04,
    getPitch: () => 45.4,
    jumpTo: vi.fn(),
  };
  const deps: MapToolDeps = {
    getMap: () => map,
    getStyle: () => 'geolonia/basic-v2',
    setStyle: vi.fn(),
    getLanguage: () => 'auto',
    getRenderer: () => 'maplibre',
    ...overrides,
  };
  return { map, deps };
};

const findTool = (tools: McpTool[], name: string) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
};

describe('get_map_state', () => {
  it('is read-only and returns the camera, style, language and renderer as JSON text', async () => {
    const { deps } = createDeps();
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
    });
  });

  it('fails while the map is not ready', async () => {
    const { deps } = createDeps({ getMap: () => undefined });
    const tool = findTool(createMapTools(deps), 'get_map_state');

    await expect(tool.execute({})).rejects.toThrow('地図');
  });
});

describe('move_map', () => {
  it('jumps to the given center and zoom and reports the result', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    const result = await tool.execute({ lat: 34.6937, lng: 135.5023, zoom: 16 });

    expect(map.jumpTo).toHaveBeenCalledWith({ center: [135.5023, 34.6937], zoom: 16 });
    expect(result).toContain('34.6937');
  });

  it('only passes what was given', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await tool.execute({ bearing: 90, pitch: 60 });

    expect(map.jumpTo).toHaveBeenCalledWith({ bearing: 90, pitch: 60 });
  });

  it('rejects a latitude without a longitude', async () => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute({ lat: 35 })).rejects.toThrow('lat と lng');
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it.each([
    [{ lat: 91, lng: 0 }, 'lat'],
    [{ lat: 0, lng: 181 }, 'lng'],
    [{ zoom: 25 }, 'zoom'],
    [{ zoom: -1 }, 'zoom'],
    [{ pitch: 90 }, 'pitch'],
    [{ lat: 'x', lng: 0 }, 'lat'],
  ])('rejects out-of-range input %j', async (input, field) => {
    const { deps, map } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute(input)).rejects.toThrow(field);
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it('rejects an empty request', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'move_map');

    await expect(tool.execute({})).rejects.toThrow('少なくとも');
  });
});

describe('set_map_style', () => {
  it('offers only the standard styles as an enum', () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'set_map_style');
    const schema = tool.inputSchema as { properties: { style: { enum: string[] } } };

    expect(schema.properties.style.enum).toContain('geolonia/gsi');
    expect(schema.properties.style.enum.every((id) => id.startsWith('geolonia'))).toBe(true);
  });

  it('switches the style', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'set_map_style');

    await tool.execute({ style: 'geolonia/midnight' });

    expect(deps.setStyle).toHaveBeenCalledWith('geolonia/midnight');
  });

  it('rejects a style that is not offered, so a URL from the model never reaches the map', async () => {
    const { deps } = createDeps();
    const tool = findTool(createMapTools(deps), 'set_map_style');

    await expect(tool.execute({ style: 'https://example.com/style.json' })).rejects.toThrow('style');
    expect(deps.setStyle).not.toHaveBeenCalled();
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

    expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual(['get_map_state', 'move_map', 'set_map_style']);
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

    expect(registerTool).toHaveBeenCalledTimes(3);
  });
});
