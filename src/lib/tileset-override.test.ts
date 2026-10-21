import { describe, expect, it } from 'vitest';
import { overrideTilesetUrl } from './tileset-override';

describe('overrideTilesetUrl', () => {
  it('replaces the tileset ID on tileserver.geolonia.com', () => {
    expect(overrideTilesetUrl('https://tileserver.geolonia.com/gsi/tiles.json?key=K', { gsi: 'gsi-next' }))
      .toBe('https://tileserver.geolonia.com/gsi-next/tiles.json?key=K');
  });

  it('replaces the tileset ID on a stage-suffixed tileserver host', () => {
    expect(overrideTilesetUrl('https://tileserver-dev.geolonia.com/gsi/tiles.json', { gsi: 'gsi-next' }))
      .toBe('https://tileserver-dev.geolonia.com/gsi-next/tiles.json');
  });

  it('leaves the URL unchanged when the tileset ID is not in the map', () => {
    const url = 'https://tileserver.geolonia.com/osm/tiles.json';
    expect(overrideTilesetUrl(url, { gsi: 'gsi-next' })).toBe(url);
  });

  it('leaves URLs on other hosts unchanged', () => {
    const url = 'https://osm.v2.tiles.geolonia.com/gsi/tiles.json';
    expect(overrideTilesetUrl(url, { gsi: 'gsi-next' })).toBe(url);
  });
});
