import { describe, expect, it } from 'vitest';
import { resolveVisualScenarios } from '../src/evidence/visual-scenarios';

describe('resolveVisualScenarios', () => {
  it('disables the visual leg when no base URL is configured', () => {
    expect(resolveVisualScenarios({}).scenarios).toEqual([]);
  });

  it('derives a single legacy scenario from route/theme vars', () => {
    const { scenarios } = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_ROUTE: '/ops',
      VESTARA_SCREENSHOT_THEME: 'light',
    });
    expect(scenarios).toEqual([{ url: '/ops', viewport: { width: 1280, height: 800 }, theme: 'light' }]);
  });

  it('defaults the legacy scenario to /dashboard@1280x800@dark', () => {
    const { scenarios } = resolveVisualScenarios({ VESTARA_SCREENSHOT_URL: 'http://localhost:5173' });
    expect(scenarios[0]).toEqual({ url: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' });
  });

  it('expands a configured matrix of routes × viewports × themes', () => {
    const { scenarios, note } = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: JSON.stringify([
        { route: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' },
        { route: '/dashboard', viewport: { width: 768, height: 1024 }, theme: 'light', tolerance: 0.01 },
        { url: 'http://localhost:5173/evidence', theme: 'dark' },
      ]),
    });
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0]).toEqual({ url: '/dashboard', viewport: { width: 1280, height: 800 }, theme: 'dark' });
    expect(scenarios[1]).toEqual({
      url: '/dashboard',
      viewport: { width: 768, height: 1024 },
      theme: 'light',
      tolerance: 0.01,
    });
    expect(scenarios[2].url).toBe('http://localhost:5173/evidence');
    expect(note).toBeUndefined();
  });

  it('skips entries without a route or url', () => {
    const { scenarios, note } = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: JSON.stringify([{ viewport: { width: 320, height: 640 } }, { route: '/dashboard' }]),
    });
    expect(scenarios).toEqual([{ url: '/dashboard' }]);
    expect(note).toBeUndefined();
  });

  it('disables with a note on invalid JSON', () => {
    const result = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: 'not-json',
    });
    expect(result.scenarios).toEqual([]);
    expect(result.note).toContain('not valid JSON');
  });

  it('disables with a note on a non-array or empty matrix', () => {
    const nonArray = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: '{"route":"/dashboard"}',
    });
    expect(nonArray.scenarios).toEqual([]);
    expect(nonArray.note).toContain('non-empty array');

    const empty = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: '[]',
    });
    expect(empty.scenarios).toEqual([]);
    expect(empty.note).toContain('non-empty array');
  });

  it('disables with a note when every matrix entry is unusable', () => {
    const result = resolveVisualScenarios({
      VESTARA_SCREENSHOT_URL: 'http://localhost:5173',
      VESTARA_SCREENSHOT_MATRIX: JSON.stringify([{ viewport: { width: 320, height: 640 } }]),
    });
    expect(result.scenarios).toEqual([]);
    expect(result.note).toContain('need route/url');
  });
});
