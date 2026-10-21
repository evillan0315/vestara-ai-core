/**
 * VES-UI-002 U4 (G12 carryover): bundled wallpaper size budget.
 *
 * Locks the single-size transcoded set shipped via `frontendDist`
 * (`public/startup/` → `dist/startup/` → Tauri bundle):
 * - only the AVIF → WebP → PNG optimized set may ship (no dead
 *   duplicates, no responsive ladder, no 1.8 MB+ source PNG leaking
 *   into the bundle; `*.webp` is gitignored per root `.gitignore`, so
 *   the WebP entry is required only when present on disk);
 * - no shipped PNG is 1.8 MB or larger (U4 acceptance);
 * - total wallpaper payload stays under a 1.5 MB budget.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const STARTUP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'public',
  'startup',
);

// U4 acceptance: no 1.8 MB+ PNG shipped in the bundle.
const MAX_SHIPPED_PNG_BYTES = 1_800_000;
// Bundle budget for the whole wallpaper set (AVIF + WebP + PNG).
const MAX_WALLPAPER_PAYLOAD_BYTES = 1_500_000;

describe('StartupWallpaper bundle budget (U4)', () => {
  it('ships only the optimized set with no dead duplicates', () => {
    const files = readdirSync(STARTUP_DIR).sort();
    // Tracked shippables are always present; the WebP entry is
    // gitignored (`*.webp` in root `.gitignore`) so it is only
    // asserted when present on disk.
    expect(files).toContain('vestara-startup-bg.avif');
    expect(files).toContain('vestara-startup-bg.png');
    for (const file of files) {
      expect([
        'vestara-startup-bg.avif',
        'vestara-startup-bg.png',
        'vestara-startup-bg.webp',
      ]).toContain(file);
    }
  });

  it('ships no 1.8 MB+ PNG', () => {
    const pngs = readdirSync(STARTUP_DIR).filter((f) => f.endsWith('.png'));
    expect(pngs.length).toBeGreaterThan(0);
    for (const file of pngs) {
      const size = statSync(path.join(STARTUP_DIR, file)).size;
      expect(size).toBeLessThan(MAX_SHIPPED_PNG_BYTES);
    }
  });

  it('keeps the total wallpaper payload under budget', () => {
    const files = readdirSync(STARTUP_DIR);
    const total = files
      .map((f) => statSync(path.join(STARTUP_DIR, f)).size)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(MAX_WALLPAPER_PAYLOAD_BYTES);
  });
});
