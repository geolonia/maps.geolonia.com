import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSavedState, getDefaultCameraOptions, INITIAL_STATE } from './saved-state';

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

describe('getCurrentSavedState', () => {
  it('returns the initial state when nothing is saved', () => {
    expect(getCurrentSavedState()).toEqual(INITIAL_STATE);
  });

  it('merges the saved state over the initial state', () => {
    localStorage.setItem('geolstate', JSON.stringify({ style: 'geolonia/gsi', z: 10 }));
    expect(getCurrentSavedState()).toEqual({ ...INITIAL_STATE, style: 'geolonia/gsi', z: 10 });
  });

  it('returns the initial state when the saved value is JSON null', () => {
    localStorage.setItem('geolstate', 'null');
    expect(getCurrentSavedState()).toEqual(INITIAL_STATE);
  });

  it('returns the initial state when the saved value is an empty string', () => {
    localStorage.setItem('geolstate', '');
    expect(getCurrentSavedState()).toEqual(INITIAL_STATE);
  });

  it('falls back to the initial state when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(getCurrentSavedState()).toEqual(INITIAL_STATE);
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to the initial state when the saved value is not valid JSON', () => {
    localStorage.setItem('geolstate', '{');
    expect(getCurrentSavedState()).toEqual(INITIAL_STATE);
  });
});

describe('getDefaultCameraOptions', () => {
  it('uses the map position in the hash when there is one', () => {
    window.location.hash = '#map=14/35.6812/139.7671';
    expect(getDefaultCameraOptions(INITIAL_STATE)).toEqual({
      center: { lat: 35.6812, lng: 139.7671 },
      zoom: 14,
    });
  });

  it('returns NaN values when the map position in the hash is malformed', () => {
    window.location.hash = '#map=abc';
    const options = getDefaultCameraOptions(INITIAL_STATE);
    expect(options.zoom).toBeNaN();
    expect(options.center.lat).toBeNaN();
    expect(options.center.lng).toBeNaN();
  });

  it('uses the given state when the hash has no map position', () => {
    expect(getDefaultCameraOptions({ ...INITIAL_STATE, z: 8.5, lat: 34.6937, lng: 135.5023 })).toEqual({
      center: { lat: 34.6937, lng: 135.5023 },
      zoom: 8.5,
    });
  });
});
