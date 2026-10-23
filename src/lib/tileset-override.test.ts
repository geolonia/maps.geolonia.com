import { describe, expect, it } from 'vitest';
import { overrideTilesetUrl } from './tileset-override';

describe('overrideTilesetUrl', () => {
  it('replaces the tileset ID on tileserver.geolonia.com', () => {
    expect(overrideTilesetUrl('https://tileserver.geolonia.com/gsi/tiles.json?key=K', new Map([['gsi', 'gsi-next']])))
      .toBe('https://tileserver.geolonia.com/gsi-next/tiles.json?key=K');
  });

  it('replaces the tileset ID on a stage-suffixed tileserver host', () => {
    expect(overrideTilesetUrl('https://tileserver-dev.geolonia.com/gsi/tiles.json', new Map([['gsi', 'gsi-next']])))
      .toBe('https://tileserver-dev.geolonia.com/gsi-next/tiles.json');
  });

  it('leaves the URL unchanged when the tileset ID is not in the map', () => {
    const url = 'https://tileserver.geolonia.com/osm/tiles.json';
    expect(overrideTilesetUrl(url, new Map([['gsi', 'gsi-next']]))).toBe(url);
  });

  it('uses the matching entry when the map has several tileset IDs', () => {
    expect(overrideTilesetUrl('https://tileserver.geolonia.com/osm/tiles.json', new Map([['gsi', 'gsi-next'], ['osm', 'osm-dev']])))
      .toBe('https://tileserver.geolonia.com/osm-dev/tiles.json');
  });

  it('leaves the URL unchanged when the tileset ID has no trailing slash', () => {
    const url = 'https://tileserver.geolonia.com/gsi';
    expect(overrideTilesetUrl(url, new Map([['gsi', 'gsi-next']]))).toBe(url);
  });

  it('leaves URLs on other hosts unchanged', () => {
    const url = 'https://osm.v2.tiles.geolonia.com/gsi/tiles.json';
    expect(overrideTilesetUrl(url, new Map([['gsi', 'gsi-next']]))).toBe(url);
  });

  it('leaves tileset IDs named like Object.prototype properties unchanged when they are not in the map', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const url = `https://tileserver.geolonia.com/${id}/tiles.json`;
      expect(overrideTilesetUrl(url, new Map([['gsi', 'gsi-next']]))).toBe(url);
    }
  });

  it('replaces tileset IDs named like Object.prototype properties when they are in the map', () => {
    expect(overrideTilesetUrl('https://tileserver.geolonia.com/constructor/tiles.json', new Map([['constructor', 'next']])))
      .toBe('https://tileserver.geolonia.com/next/tiles.json');
  });
});
