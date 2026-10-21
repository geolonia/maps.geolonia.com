import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentSavedState, getDefaultCameraOptions, INITIAL_STATE } from './saved-state';

afterEach(() => {
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

  it('uses the given state when the hash has no map position', () => {
    expect(getDefaultCameraOptions({ ...INITIAL_STATE, z: 8.5, lat: 34.6937, lng: 135.5023 })).toEqual({
      center: { lat: 34.6937, lng: 135.5023 },
      zoom: 8.5,
    });
  });
});
