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

  it('uses one digit at zoom 0', () => {
    expect(formatPosition({ lng: 136.944123, lat: 35.645123 }, 0).zLatLng).toBe('0/35.6/136.9');
  });

  it('keeps the sign of negative coordinates', () => {
    expect(formatPosition({ lng: -73.985664, lat: 40.748441 }, 10).zLatLng).toBe('10/40.7484/-73.9857');
  });

  it('rounds the zoom to 2 decimals before rounding it up in the string', () => {
    expect(formatPosition({ lng: 139.7671234, lat: 35.6812345 }, 13.004).zLatLng).toBe('13/35.68123/139.76712');
    expect(formatPosition({ lng: 139.7671234, lat: 35.6812345 }, 13.006).zLatLng).toBe('14/35.68123/139.76712');
  });

  it('rounds a fractional zoom up in the string', () => {
    expect(formatPosition({ lng: 139.7671, lat: 35.6812 }, 13.2).zLatLng).toBe('14/35.6812/139.7671');
  });
});
