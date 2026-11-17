// Geolonia の 3D スタイル（geolonia/toranomon）と同じ PLATEAU の建物のタイルを、ほかのスタイルにも重ねて描く
// タイルは Geolonia のタイルサーバーが配る .bld 形式。地図の apiKey が URL の YOUR-API-KEY を置き換える
export const PLATEAU_BLD_TILEJSON_URL = 'https://tileserver.geolonia.com/bld/tiles.json?key=YOUR-API-KEY';

export const PLATEAU_SOURCE_ID = 'plateau-buildings';
export const PLATEAU_LAYER_ID = 'plateau-buildings';

const PLATEAU_ATTRIBUTION = '出典：<a href="https://www.mlit.go.jp/plateau/">国土交通省 Project PLATEAU</a>（3D都市モデルを加工して作成）';

// 窓・ドア・付属物は部位で、それ以外は LOD で色を分ける
const PLATEAU_BUILDING_COLOR = [
  'match',
  ['get', '部位'],
  '窓', '#a9d4f5',
  'ドア', '#c8b49c',
  '付属物', ['match', ['get', 'LOD'], 3, '#fff0d5', '#fffcf6'],
  ['match', ['get', 'LOD'], 1, '#e4e0d8', 2, '#fffaf1', '#ffeccb'],
];

export const plateauSource = () => ({
  type: 'bld',
  url: PLATEAU_BLD_TILEJSON_URL,
  promoteId: 'buildingID',
  cacheBytes: 128 * 1024 * 1024,
  attribution: PLATEAU_ATTRIBUTION,
});

export const plateauLayer = () => ({
  id: PLATEAU_LAYER_ID,
  type: 'bld',
  source: PLATEAU_SOURCE_ID,
  paint: {
    'bld-color': PLATEAU_BUILDING_COLOR,
    'bld-opacity': 1,
    'bld-edge-width': 1,
    'bld-edge-color': 'rgba(70,90,140,0.35)',
    'bld-edge-pencil': 0,
    'bld-ambient-occlusion-intensity': 0.15,
    'bld-ambient-occlusion-radius': 12,
    'bld-ambient': 0.68,
  },
});

export type PlateauMap = {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  addSource(id: string, source: object): unknown;
  addLayer(layer: object): unknown;
};

// スタイルを読み直すと足したレイヤーは消えるので、style.load のたびに呼ぶ。2 回呼んでも 1 つしか足さない
export const addPlateauBuildings = (map: PlateauMap) => {
  if (!map.getSource(PLATEAU_SOURCE_ID)) {
    map.addSource(PLATEAU_SOURCE_ID, plateauSource());
  }
  if (!map.getLayer(PLATEAU_LAYER_ID)) {
    map.addLayer(plateauLayer());
  }
};
