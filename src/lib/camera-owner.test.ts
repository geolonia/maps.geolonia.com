import { describe, expect, it, vi } from 'vitest';
import { claimCamera, releaseCamera } from './camera-owner';

describe('claimCamera', () => {
  it('asks the previous owner on the same map to give up the camera', () => {
    const map = {};
    const first = { yieldCamera: vi.fn() };
    const second = { yieldCamera: vi.fn() };
    claimCamera(map, first);
    claimCamera(map, second);
    expect(first.yieldCamera).toHaveBeenCalledTimes(1);
    expect(second.yieldCamera).not.toHaveBeenCalled();
  });

  it('does not touch an owner on another map', () => {
    const owner = { yieldCamera: vi.fn() };
    claimCamera({}, owner);
    claimCamera({}, { yieldCamera: vi.fn() });
    expect(owner.yieldCamera).not.toHaveBeenCalled();
  });

  it('does not ask an owner that has released the camera', () => {
    const map = {};
    const first = { yieldCamera: vi.fn() };
    claimCamera(map, first);
    releaseCamera(map, first);
    claimCamera(map, { yieldCamera: vi.fn() });
    expect(first.yieldCamera).not.toHaveBeenCalled();
  });

  it('keeps the new owner when the previous one releases late', () => {
    const map = {};
    const first = { yieldCamera: vi.fn() };
    const second = { yieldCamera: vi.fn() };
    claimCamera(map, first);
    claimCamera(map, second);
    releaseCamera(map, first);
    claimCamera(map, { yieldCamera: vi.fn() });
    expect(second.yieldCamera).toHaveBeenCalledTimes(1);
  });
});
