import { describe, expect, it } from 'vitest';
import { isRenderer, RENDERERS, resolveRenderer } from './renderer';

describe('resolveRenderer', () => {
  it('defaults to maplibre', () => {
    expect(resolveRenderer(null, null)).toBe('maplibre');
  });

  it('uses the stored renderer when the hash has none', () => {
    expect(resolveRenderer(null, 'mach-gl')).toBe('mach-gl');
  });

  it('prefers the hash over the stored renderer', () => {
    expect(resolveRenderer('maplibre', 'mach-gl')).toBe('maplibre');
    expect(resolveRenderer('mach-gl', 'maplibre')).toBe('mach-gl');
  });

  it('ignores unknown renderers', () => {
    expect(resolveRenderer('leaflet', null)).toBe('maplibre');
    expect(resolveRenderer(null, 'leaflet')).toBe('maplibre');
    expect(resolveRenderer('unknown', 'mach-gl')).toBe('mach-gl');
  });
});

describe('isRenderer', () => {
  it('accepts every renderer offered as a choice', () => {
    expect(RENDERERS.map(({ value }) => isRenderer(value))).toEqual([ true, true ]);
  });

  it('rejects anything else', () => {
    expect(isRenderer('leaflet')).toBe(false);
    expect(isRenderer('')).toBe(false);
    expect(isRenderer(null)).toBe(false);
  });
});
