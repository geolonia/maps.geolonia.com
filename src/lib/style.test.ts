import { describe, expect, it } from 'vitest';
import { resolveLanguage, styleIdToUrl } from './style';

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

describe('resolveLanguage', () => {
  it('keeps a language that was chosen', () => {
    expect(resolveLanguage('en', [ 'ja-JP' ])).toBe('en');
    expect(resolveLanguage('ja', [ 'en-US' ])).toBe('ja');
  });

  it('picks Japanese for auto when the first browser language is ja or ja-JP', () => {
    expect(resolveLanguage('auto', [ 'ja-JP', 'en-US' ])).toBe('ja');
    expect(resolveLanguage('auto', [ 'ja' ])).toBe('ja');
  });

  it('picks English for auto otherwise, as maps-core does', () => {
    expect(resolveLanguage('auto', [ 'en-US', 'ja-JP' ])).toBe('en');
    expect(resolveLanguage('auto', [ 'ja-Hira' ])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
  });

  it('falls back to the single browser language when the list is empty', () => {
    expect(resolveLanguage('auto', [], 'ja-JP')).toBe('ja');
  });
});
