import { describe, expect, it, vi } from 'vitest';
import { getCameraAnimation, registerCameraAnimation, stopCameraAnimations, type CameraAnimation } from './camera-animations';

const createAnimation = (): CameraAnimation => ({ start: vi.fn(), stop: vi.fn(), isRunning: vi.fn(() => false) });

describe('camera animations', () => {
  it('finds a registered animation by name', () => {
    const animation = createAnimation();
    const unregister = registerCameraAnimation('circle-flight', animation);

    expect(getCameraAnimation('circle-flight')).toBe(animation);

    unregister();
    expect(getCameraAnimation('circle-flight')).toBeUndefined();
  });

  it('keeps a newer registration when an older one is unregistered later', () => {
    const older = createAnimation();
    const newer = createAnimation();
    const unregisterOlder = registerCameraAnimation('tour', older);
    registerCameraAnimation('tour', newer);

    unregisterOlder();

    expect(getCameraAnimation('tour')).toBe(newer);
  });

  it('stops only the animations that are running', () => {
    const running = { ...createAnimation(), isRunning: () => true };
    const idle = createAnimation();
    const unregisterRunning = registerCameraAnimation('circle-flight', running);
    const unregisterIdle = registerCameraAnimation('tour', idle);

    stopCameraAnimations();

    expect(running.stop).toHaveBeenCalledTimes(1);
    expect(idle.stop).not.toHaveBeenCalled();
    unregisterRunning();
    unregisterIdle();
  });
});
