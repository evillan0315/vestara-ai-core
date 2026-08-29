// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, VIEWPORT_GROUPS } from '../config';

describe('config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to desktop viewports and compare mode', () => {
    const config = loadConfig();
    expect(config.viewports).toEqual(VIEWPORT_GROUPS.desktop);
    expect(config.mode).toBe('compare');
    expect(config.themes.map((t) => t.id)).toEqual(['dark', 'light']);
    expect(config.tolerance).toBe(0.1);
    expect(config.maxDiffPercent).toBe(0.5);
  });

  it('honors the SCREENSHOT_VIEWPORT env var', () => {
    process.env.SCREENSHOT_VIEWPORT = 'mobile';
    expect(loadConfig().viewports).toEqual(VIEWPORT_GROUPS.mobile);
    process.env.SCREENSHOT_VIEWPORT = 'tablet';
    expect(loadConfig().viewports).toEqual(VIEWPORT_GROUPS.tablet);
  });

  it('honors update mode and tolerances', () => {
    process.env.SCREENSHOT_MODE = 'update';
    process.env.SCREENSHOT_TOLERANCE = '0.25';
    process.env.SCREENSHOT_MAX_DIFF = '1';
    const config = loadConfig();
    expect(config.mode).toBe('update');
    expect(config.tolerance).toBe(0.25);
    expect(config.maxDiffPercent).toBe(1);
  });

  it('has the required device coverage', () => {
    expect(VIEWPORT_GROUPS.desktop.length).toBeGreaterThanOrEqual(4);
    expect(VIEWPORT_GROUPS.tablet.length).toBeGreaterThanOrEqual(3);
    expect(VIEWPORT_GROUPS.mobile.length).toBeGreaterThanOrEqual(4);
  });
});
