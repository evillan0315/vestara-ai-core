/** @vitest-environment jsdom */
/**
 * VES-UI-001 T1 (G12): StartupWallpaper guards.
 *
 * Locks the single-size optimized wallpaper pipeline:
 * - AVIF → WebP → PNG source order (PNG fallback retained).
 * - Decorative (`aria-hidden`, empty `alt`), lazy (`loading="lazy"`,
 *   `decoding="async"`).
 * - `treatment="boot"` preserves the 10%/blur-20 boot treatment class for
 *   the T4 boot/login state machine.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StartupWallpaper } from './StartupWallpaper';

describe('StartupWallpaper', () => {
  it('serves one optimized size as AVIF → WebP → PNG with lazy loading', () => {
    const { container } = render(<StartupWallpaper />);
    const picture = container.querySelector('picture.st-wallpaper');
    expect(picture).toBeInTheDocument();
    expect(picture?.getAttribute('aria-hidden')).toBe('true');

    const sources = [...(picture?.querySelectorAll('source') ?? [])];
    expect(sources.map((s) => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp']);
    expect(sources[0]?.getAttribute('srcSet')).toBe('/startup/vestara-startup-bg.avif');
    expect(sources[1]?.getAttribute('srcSet')).toBe('/startup/vestara-startup-bg.webp');

    const img = picture?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/startup/vestara-startup-bg.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });

  it('preserves the 10%/blur-20 boot treatment for the boot variant', () => {
    const { container } = render(<StartupWallpaper treatment="boot" />);
    const picture = container.querySelector('picture.st-wallpaper--boot');
    expect(picture).toBeInTheDocument();
    expect(picture?.getAttribute('data-treatment')).toBe('boot');
  });

  it('defaults to the full treatment', () => {
    const { container } = render(<StartupWallpaper />);
    const picture = container.querySelector('picture.st-wallpaper');
    expect(picture?.getAttribute('data-treatment')).toBe('full');
    expect(container.querySelector('picture.st-wallpaper--boot')).toBeNull();
  });
});
