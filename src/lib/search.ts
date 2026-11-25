import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { normalize } from '@geolonia/normalize-any-latlng';
import { coordinatesToFeatureCollection } from './coordinates';
import { pointBounds, type Corners } from './bounds';

type SearchResults = FeatureCollection<Geometry, GeoJsonProperties>;

// 使うメソッドだけに絞り、MapLibre と MachGL のどちらも、テストでは偽の地図も渡せるようにする
export type SearchMap = {
  getCenter: () => { lng: number, lat: number }
  getSource: (id: string) => { type: string } | undefined
  addSource: (id: string, source: { type: 'geojson', data: SearchResults }) => unknown
  getLayer: (id: string) => unknown
  addLayer: (layer: never) => unknown
  fitBounds: (bounds: Corners, options: { padding: number, maxZoom: number }) => unknown
};

const SOURCE_ID = 'search-results';

const addResultLayers = (map: SearchMap) => {
  const textColor = '#000000';
  const textHaloColor = '#FFFFFF';
  const backgroundColor = 'rgba(255, 0, 0, 0.4)';
  const strokeColor = '#FFFFFF';
  const add = (layer: object) => map.addLayer(layer as never);

  add({
    id: 'search-results-circle',
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 13,
      'circle-color': ['string', ['get', 'marker-color'], backgroundColor],
      'circle-opacity': ['number', ['get', 'fill-opacity'], 1.0],
      'circle-stroke-width': ['number', ['get', 'stroke-width'], 1],
      'circle-stroke-color': ['string', ['get', 'stroke'], strokeColor],
      'circle-stroke-opacity': ['number', ['get', 'stroke-opacity'], 1.0],
    },
  });

  add({
    id: 'search-results-symbol',
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['get', 'index'],
      'text-size': 14,
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
    },
  });

  add({
    id: 'search-results-label',
    type: 'symbol',
    source: SOURCE_ID,
    paint: {
      'text-color': ['string', ['get', 'text-color'], textColor],
      'text-halo-color': ['string', ['get', 'text-halo-color'], textHaloColor],
      'text-halo-width': 1,
    },
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-max-width': 12,
      'text-offset': [
        'case',
        ['==', 'small', ['get', 'marker-size']], ['literal', [0, 0.6]],
        ['==', 'large', ['get', 'marker-size']], ['literal', [0, 1.2]],
        ['literal', [0, 0.8]],
      ],
      'text-allow-overlap': false,
    },
  });
};

// 緯度経度ならそのまま、そうでなければ地名として検索し、結果を地図に描いて寄る。結果の GeoJSON を返す。
// 検索 API が失敗を返したときは、地図に触れずに投げる
export type SearchOptions = {
  fetchApi?: typeof fetch
  // 地図を動かす直前に呼ぶ。検索が失敗したときや、動かす結果が無いときは呼ばない
  beforeFit?: () => void
};

export const searchPlaces = async (
  map: SearchMap,
  query: string,
  { fetchApi = (...args) => fetch(...args), beforeFit }: SearchOptions = {},
): Promise<SearchResults> => {
  let data: SearchResults;
  const queriesInCoord = normalize(query).filter((coord) => coord.lat !== null && coord.lng !== null);

  if (queriesInCoord.length > 0) {
    data = coordinatesToFeatureCollection(queriesInCoord as { lat: number, lng: number }[]);
  } else {
    const qsa = new URLSearchParams();
    qsa.set('q', query);
    const { lng, lat } = map.getCenter();
    qsa.set('pos', `${lng},${lat}`);
    const resp = await fetchApi(`https://api.maps.geolonia.com/v1/search?${qsa.toString()}`, { method: 'get' });
    const body = await resp.json();
    if (body.error === true) {
      throw new Error(`検索に失敗しました: ${JSON.stringify(body)}`);
    }
    data = body.geojson as SearchResults;
  }

  const source = map.getSource(SOURCE_ID);
  if (source) {
    if (source.type !== 'geojson') return data;
    (source as unknown as { setData: (d: SearchResults) => void }).setData(data);
  } else {
    map.addSource(SOURCE_ID, { type: 'geojson', data });
  }

  if (!map.getLayer('search-results-circle')) {
    addResultLayers(map);
  }

  const bounds = pointBounds(data);
  if (typeof bounds !== 'undefined') {
    beforeFit?.();
    // 結果が 1 件だと範囲の大きさが 0 になり、上限まで寄ってしまうので、街区が見える程度で止める
    map.fitBounds(bounds, { padding: 200, maxZoom: 17 });
  }
  return data;
};
