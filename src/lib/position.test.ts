import { describe, expect, it } from 'vitest';
import { formatPosition } from './position';

describe('formatPosition', () => {
  it('rounds the coordinates to a precision that depends on the zoom', () => {
    expect(formatPosition({ lng: 139.767123456, lat: 35.681234567 }, 14)).toEqual({
      zLatLng: '14/35.68123/139.76712',
      lat: 35.68123,
      lng: 139.76712,
    });
  });

  it('uses fewer digits at a lower zoom', () => {
    expect(formatPosition({ lng: 136.944123, lat: 35.645123 }, 6)).toEqual({
      zLatLng: '6/35.645/136.944',
      lat: 35.645,
      lng: 136.944,
    });
  });

  it('rounds a fractional zoom up in the string', () => {
    expect(formatPosition({ lng: 139.7671, lat: 35.6812 }, 13.2).zLatLng).toBe('14/35.6812/139.7671');
  });
});
