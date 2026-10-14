/**
 * @vestara/marketplace-ui — theme accent wiring contracts.
 *
 * Proves the gallery binds to the runtime theme accent palette:
 * palette resolution defaults to canonical amber, type accents stay
 * categorical with an accent fallback, glow helpers emit color-mix
 * shadows, and every accent var/contract resolves to var(--vestara-*).
 */

import { describe, expect, it } from 'vitest';
import {
  ACCENT_PALETTES,
  accentGlow,
  DEFAULT_ACCENT_THEME,
  DISCOVER_ACCENT,
  displayForLiveAsset,
  MARKETPLACE_ACCENT_VARS,
  MARKETPLACE_LAYOUT_VARS,
  marketplacePrimaryForTheme,
  resolveAccentPalette,
  typeAccent,
} from '../src/index';

describe('resolveAccentPalette', () => {
  it('defaults to the canonical Vestara amber palette', () => {
    expect(DEFAULT_ACCENT_THEME).toBe('amber');
    expect(resolveAccentPalette()).toEqual(ACCENT_PALETTES.amber);
    expect(resolveAccentPalette().hex).toBe('#f59e0b');
  });

  it('resolves a named theme palette', () => {
    expect(resolveAccentPalette('blue')).toEqual(ACCENT_PALETTES.blue);
    expect(resolveAccentPalette('violet').hex).toBe('#8b5cf6');
  });
});

describe('typeAccent', () => {
  it('maps asset types to categorical marketplace tokens', () => {
    expect(typeAccent('agent')).toBe('var(--vestara-marketplace-agent)');
    expect(typeAccent('skill')).toBe('var(--vestara-marketplace-skill)');
    expect(typeAccent('mcp-server')).toBe('var(--vestara-marketplace-mcp)');
  });

  it('falls back to the live theme accent for unmapped types', () => {
    expect(typeAccent('something-new')).toBe('var(--vestara-accent)');
    expect(typeAccent('something-new')).toBe(DISCOVER_ACCENT.fallback);
  });
});

describe('accentGlow', () => {
  it('emits a color-mix glow for the live theme accent by default', () => {
    expect(accentGlow()).toBe('0 0 12px color-mix(in srgb, var(--vestara-accent) 45%, transparent)');
  });

  it('supports explicit accents and amounts', () => {
    expect(accentGlow('var(--vestara-marketplace-primary)', 40)).toBe(
      '0 0 12px color-mix(in srgb, var(--vestara-marketplace-primary) 40%, transparent)',
    );
  });
});

describe('marketplacePrimaryForTheme', () => {
  it('aligns the marketplace primary with the selected accent palette', () => {
    expect(marketplacePrimaryForTheme()).toEqual({
      primary: '#f59e0b',
      primaryBg: '#f59e0b14',
      primaryBorder: '#f59e0b40',
    });
    expect(marketplacePrimaryForTheme('blue').primary).toBe('#3b82f6');
    expect(marketplacePrimaryForTheme('violet').primary).toBe('#8b5cf6');
    expect(marketplacePrimaryForTheme('gold').primary).toBe('#D4A843');
  });
});

describe('accent contracts', () => {
  it('every accent var is a vestara custom property', () => {
    for (const name of Object.values(MARKETPLACE_ACCENT_VARS)) {
      expect(name.startsWith('--vestara-')).toBe(true);
    }
  });

  it('every layout var (incl. the shared gallery surface) is a vestara custom property', () => {
    for (const name of Object.values(MARKETPLACE_LAYOUT_VARS)) {
      expect(name.startsWith('--vestara-')).toBe(true);
    }
    expect(MARKETPLACE_LAYOUT_VARS.galleryCardBg).toBe('--vestara-gallery-card-bg');
  });

  it('gallery chrome treatments reference the dynamic accent family', () => {
    expect(DISCOVER_ACCENT.accent).toBe('var(--vestara-accent)');
    expect(DISCOVER_ACCENT.wash).toBe('var(--vestara-accent-bg)');
    expect(DISCOVER_ACCENT.hairline).toBe('var(--vestara-accent-border)');
  });

  it('live assets default to the marketplace primary tile accent', () => {
    const display = displayForLiveAsset({
      publisherId: 'vestara',
      packageName: 'demo',
      displayName: 'Demo',
    });
    expect(display.accent).toBe('var(--vestara-marketplace-primary)');
    expect(display.rating).toBeGreaterThanOrEqual(4.2);
    expect(display.rating).toBeLessThanOrEqual(4.9);
  });
});
