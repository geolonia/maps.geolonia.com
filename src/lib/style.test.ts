import { describe, expect, it } from 'vitest';
import { styleIdToUrl } from './style';

describe('styleIdToUrl', () => {
  it('returns a full URL unchanged', () => {
    const url = 'https://geolonia.github.io/openstreetmap-carto/style.json';
    expect(styleIdToUrl(url, 'ja')).toBe(url);
  });

  it('builds the CDN URL for a style ID when a language is given', () => {
    expect(styleIdToUrl('geolonia/gsi', 'en')).toBe('https://cdn.geolonia.com/style/geolonia/gsi/en.json');
  });

  it('returns the style ID itself when the language is auto', () => {
    expect(styleIdToUrl('geolonia/gsi', 'auto')).toBe('geolonia/gsi');
  });

  it('returns the style ID itself when no language is given', () => {
    expect(styleIdToUrl('geolonia/gsi')).toBe('geolonia/gsi');
  });

  it('drops everything after a semicolon when no language is given', () => {
    expect(styleIdToUrl('geolonia/gsi;extra')).toBe('geolonia/gsi');
  });
});
