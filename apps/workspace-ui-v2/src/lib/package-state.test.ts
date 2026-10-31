import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPackageLaunchable,
  readPackageLifecycle,
  setPackageEnabled,
  setPackageInstalled,
  subscribePackageState,
  VOICE_PACKAGE_ID,
} from './package-state';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('package-state', () => {
  it('ships the voice package installed and enabled by default', () => {
    expect(readPackageLifecycle(VOICE_PACKAGE_ID)).toEqual({ installed: true, enabled: true });
    expect(isPackageLaunchable('voice')).toBe(true);
  });

  it('leaves unrelated shell windows always launchable', () => {
    expect(isPackageLaunchable('terminal')).toBe(true);
    expect(isPackageLaunchable('marketplace')).toBe(true);
  });

  it('uninstalling removes the launcher and reinstalling restores it', () => {
    setPackageInstalled(VOICE_PACKAGE_ID, false);
    expect(readPackageLifecycle(VOICE_PACKAGE_ID)).toEqual({ installed: false, enabled: false });
    expect(isPackageLaunchable('voice')).toBe(false);

    setPackageInstalled(VOICE_PACKAGE_ID, true);
    expect(readPackageLifecycle(VOICE_PACKAGE_ID)).toEqual({ installed: true, enabled: true });
    expect(isPackageLaunchable('voice')).toBe(true);
  });

  it('disabling keeps the package installed but blocks launching', () => {
    setPackageEnabled(VOICE_PACKAGE_ID, false);
    expect(readPackageLifecycle(VOICE_PACKAGE_ID)).toEqual({ installed: true, enabled: false });
    expect(isPackageLaunchable('voice')).toBe(false);

    setPackageEnabled(VOICE_PACKAGE_ID, true);
    expect(isPackageLaunchable('voice')).toBe(true);
  });

  it('persists lifecycle across reads', () => {
    setPackageEnabled(VOICE_PACKAGE_ID, false);
    expect(readPackageLifecycle(VOICE_PACKAGE_ID).enabled).toBe(false);
  });

  it('notifies subscribers on every mutation', () => {
    const fn = vi.fn();
    const stop = subscribePackageState(fn);
    setPackageEnabled(VOICE_PACKAGE_ID, false);
    setPackageInstalled(VOICE_PACKAGE_ID, false);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
    setPackageEnabled(VOICE_PACKAGE_ID, true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
