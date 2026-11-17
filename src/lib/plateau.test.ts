import { describe, expect, it } from 'vitest';
import { addPlateauBuildings, PLATEAU_LAYER_ID, PLATEAU_SOURCE_ID, type PlateauMap } from './plateau';

const fakeMap = () => {
  const sources = new Map<string, object>();
  const layers: { id: string, source: string, type: string }[] = [];
  const map: PlateauMap = {
    getSource: (id) => sources.get(id),
    getLayer: (id) => layers.find((l) => l.id === id),
    addSource: (id, source) => sources.set(id, source),
    addLayer: (layer) => layers.push(layer as { id: string, source: string, type: string }),
  };
  return { map, sources, layers };
};

describe('addPlateauBuildings', () => {
  it('adds a bld source and a layer that draws it', () => {
    const { map, sources, layers } = fakeMap();
    addPlateauBuildings(map);
    expect(sources.get(PLATEAU_SOURCE_ID)).toMatchObject({
      type: 'bld',
      url: 'https://tileserver.geolonia.com/bld/tiles.json?key=YOUR-API-KEY',
      promoteId: 'buildingID',
    });
    expect(layers).toEqual([expect.objectContaining({ id: PLATEAU_LAYER_ID, type: 'bld', source: PLATEAU_SOURCE_ID })]);
  });

  it('does not add them twice', () => {
    const { map, sources, layers } = fakeMap();
    addPlateauBuildings(map);
    addPlateauBuildings(map);
    expect(sources.size).toBe(1);
    expect(layers).toHaveLength(1);
  });
});
