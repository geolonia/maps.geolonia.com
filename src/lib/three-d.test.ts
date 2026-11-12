import { describe, expect, it, vi } from 'vitest';
import { applyThreeDVisibility } from './three-d';

describe('applyThreeDVisibility', () => {
  it('shows visible-on-3d layers and hides hide-on-3d layers', () => {
    const setLayoutProperty = vi.fn();
    applyThreeDVisibility({
      getStyle: () => ({
        layers: [
          { id: 'building-3d', metadata: { 'visible-on-3d': true } },
          { id: 'building', metadata: { 'hide-on-3d': true } },
          { id: 'road' },
          { id: 'water', metadata: { 'visible-on-3d': false } },
        ],
      }),
      setLayoutProperty,
    });
    expect(setLayoutProperty.mock.calls).toEqual([
      ['building-3d', 'visibility', 'visible'],
      ['building', 'visibility', 'none'],
    ]);
  });

  it('does nothing without a style', () => {
    const setLayoutProperty = vi.fn();
    applyThreeDVisibility({ getStyle: () => undefined, setLayoutProperty });
    expect(setLayoutProperty).not.toHaveBeenCalled();
  });
});
