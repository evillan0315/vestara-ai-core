/**
 * U4/U5 — wallpaper bundle budget guards (workspace-ui-v2).
 *
 * - Single 1671×941 size only (no multi-size fan-out in the bundle).
 * - No 1.8 MB+ file ships: PNG 222 KB / WebP ~54 KB / AVIF ~36 KB.
 * - Manifest exposes all three sources for `<picture>` progressive loading.
 *
 * Architecture Traceability:
 *   U4: wallpaper assets in bundle (transcoded, budgeted)
 */

/** @vitest-environment node */
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WALLPAPER_FILE_BUDGET_BYTES, WALLPAPER_HEIGHT, WALLPAPER_SOURCES, WALLPAPER_WIDTH } from './wallpapers';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

describe('wallpaper bundle budget (U4)', () => {
  it('pins the single shipped size', () => {
    expect(WALLPAPER_WIDTH).toBe(1671);
    expect(WALLPAPER_HEIGHT).toBe(941);
  });

  it('ships no 1.8 MB+ file', () => {
    for (const file of [
      'wallpaper-teal-giant-planet-mountain-lake.png',
      'wallpaper-teal-giant-planet-mountain-lake.webp',
      'wallpaper-teal-giant-planet-mountain-lake.avif',
    ]) {
      const size = statSync(join(ASSETS, file)).size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(WALLPAPER_FILE_BUDGET_BYTES);
    }
  });

  it('prefers modern codecs over the PNG fallback', () => {
    const png = statSync(join(ASSETS, 'wallpaper-teal-giant-planet-mountain-lake.png')).size;
    const webp = statSync(join(ASSETS, 'wallpaper-teal-giant-planet-mountain-lake.webp')).size;
    const avif = statSync(join(ASSETS, 'wallpaper-teal-giant-planet-mountain-lake.avif')).size;
    expect(webp).toBeLessThan(png);
    expect(avif).toBeLessThan(png);
    expect(avif).toBeLessThan(60_000);
  });

  it('exposes avif/webp/png sources', () => {
    expect(WALLPAPER_SOURCES.avif).toMatch(/\.avif/);
    expect(WALLPAPER_SOURCES.webp).toMatch(/\.webp/);
    expect(WALLPAPER_SOURCES.png).toMatch(/\.png/);
  });
});
