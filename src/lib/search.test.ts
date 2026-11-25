import { describe, expect, it, vi } from 'vitest';
import { searchPlaces, type SearchMap } from './search';

const createMap = (existingSource?: { type: string, setData: (data: unknown) => void }) => {
  const layers = new Set<string>();
  const map = {
    getCenter: () => ({ lng: 139.7671, lat: 35.6812 }),
    getSource: vi.fn(() => existingSource),
    addSource: vi.fn(),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    fitBounds: vi.fn(),
  };
  return map as typeof map & SearchMap;
};

const apiResponse = (body: unknown) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({ json: async () => body }) as Response);

const osaka = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: '大阪市役所' }, geometry: { type: 'Point', coordinates: [135.5023, 34.6937] } }],
};

describe('searchPlaces', () => {
  it('reads coordinates in the query without calling the API', async () => {
    const map = createMap();
    const fetchApi = apiResponse({});

    const data = await searchPlaces(map, '34.6937, 135.5023', fetchApi);

    expect(fetchApi).not.toHaveBeenCalled();
    expect(data.features[0].geometry).toEqual({ type: 'Point', coordinates: [135.5023, 34.6937] });
  });

  it('asks the API near the center of the map when the query is a place name', async () => {
    const map = createMap();
    const fetchApi = apiResponse({ geojson: osaka });

    const data = await searchPlaces(map, '大阪市役所', fetchApi);

    const url = new URL(String(fetchApi.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.maps.geolonia.com/v1/search');
    expect(url.searchParams.get('q')).toBe('大阪市役所');
    expect(url.searchParams.get('pos')).toBe('139.7671,35.6812');
    expect(data).toEqual(osaka);
  });

  it('throws without touching the map when the API reports an error', async () => {
    const map = createMap();
    const fetchApi = apiResponse({ error: true, message: 'quota' });

    await expect(searchPlaces(map, '大阪市役所', fetchApi)).rejects.toThrow('検索');
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('adds the source and the three layers the first time, then fits the results', async () => {
    const map = createMap();

    await searchPlaces(map, '大阪市役所', apiResponse({ geojson: osaka }));

    expect(map.addSource).toHaveBeenCalledWith('search-results', { type: 'geojson', data: osaka });
    expect(map.addLayer.mock.calls.map(([layer]) => layer.id)).toEqual([
      'search-results-circle', 'search-results-symbol', 'search-results-label',
    ]);
    expect(map.fitBounds).toHaveBeenCalledWith([[135.5023, 34.6937], [135.5023, 34.6937]], { padding: 200, maxZoom: 17 });
  });

  it('replaces the data of the source that already exists', async () => {
    const setData = vi.fn();
    const map = createMap({ type: 'geojson', setData });

    await searchPlaces(map, '大阪市役所', apiResponse({ geojson: osaka }));

    expect(setData).toHaveBeenCalledWith(osaka);
    expect(map.addSource).not.toHaveBeenCalled();
  });

  it('does not move the camera when there is no point to show', async () => {
    const map = createMap();

    await searchPlaces(map, '見つからない場所', apiResponse({ geojson: { type: 'FeatureCollection', features: [] } }));

    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
