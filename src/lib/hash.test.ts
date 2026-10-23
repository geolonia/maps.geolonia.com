import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHash, parseTilesetOverrideHash, updateHash } from './hash';

beforeEach(() => {
  window.location.hash = '';
});

describe('parseHash', () => {
  it('reads the current location hash as query parameters', () => {
    window.location.hash = '#map=14/35.6812/139.7671&style=geolonia/gsi';
    const q = parseHash();
    expect(q.get('map')).toBe('14/35.6812/139.7671');
    expect(q.get('style')).toBe('geolonia/gsi');
  });

  it('reads the hash of the given URL instead of the current location', () => {
    window.location.hash = '#style=geolonia/gsi';
    const q = parseHash(new URL('https://example.com/#style=geolonia/midnight'));
    expect(q.get('style')).toBe('geolonia/midnight');
  });

  it('returns empty parameters when there is no hash', () => {
    expect([...parseHash().keys()]).toEqual([]);
  });
});

describe('updateHash', () => {
  it('writes the parameters to the hash without encoding slashes', () => {
    updateHash(new URLSearchParams({ map: '14/35.6812/139.7671', style: 'geolonia/gsi' }));
    expect(window.location.hash).toBe('#map=14/35.6812/139.7671&style=geolonia/gsi');
  });

  it('does not fire hashchange, so MapLibre does not move the camera to the old position in the hash', async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 10));
    // hashchange は非同期に届くので、前のテストで書いたハッシュの分が届き終わるのを待つ
    await wait();
    const listener = vi.fn();
    window.addEventListener('hashchange', listener);
    updateHash(new URLSearchParams({ style: 'geolonia/gsi' }));
    await wait();
    window.removeEventListener('hashchange', listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('round-trips with parseHash', () => {
    const q = new URLSearchParams({ map: '6/35.645/136.944', lang: 'en' });
    updateHash(q);
    expect(parseHash().toString()).toBe(q.toString());
  });
});

describe('parseTilesetOverrideHash', () => {
  it('maps each tileset ID to its replacement', () => {
    window.location.hash = '#tilesetOverride=gsi:gsi-next;osm:osm-dev';
    expect(parseTilesetOverrideHash()).toEqual({ gsi: 'gsi-next', osm: 'osm-dev' });
  });

  it('returns a map with an empty key when there is no override', () => {
    expect(parseTilesetOverrideHash()).toEqual({ '': undefined });
  });

  it('keeps everything after the first colon in the replacement ID', () => {
    window.location.hash = '#tilesetOverride=gsi:a:b';
    expect(parseTilesetOverrideHash()).toEqual({ gsi: 'a' });
  });
});
