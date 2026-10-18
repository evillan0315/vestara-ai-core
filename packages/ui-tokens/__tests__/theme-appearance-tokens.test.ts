/**
 * @vestara/ui-tokens — theme appearance catalogs (VES-DESIGN-004) contracts.
 *
 * Proves the accent / font-family / font-weight catalogs that Settings →
 * General and the Marketplace Templates tab both read are canonical and
 * complete: every accent palette carries a full ramp derived from its own
 * hex, every font stack declares a generic fallback, and the id lists stay
 * in sync with their records.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCENT_PALETTES,
  DEFAULT_ACCENT_THEME,
  FONT_FAMILIES,
  FONT_FAMILY_IDS,
  FONT_WEIGHT_IDS,
  FONT_WEIGHTS,
} from '../src/index';

const HEX = /^#[0-9a-fA-F]{6}$/;
const HEX_PAIR = /^[0-9a-fA-F]{2}$/;

describe('accent palettes', () => {
  it('keeps the canonical default accent unchanged', () => {
    expect(DEFAULT_ACCENT_THEME).toBe('amber');
    expect(ACCENT_PALETTES.amber.hex).toBe('#f59e0b');
  });

  it('catalogs the extracted Vestara Shell accent', () => {
    const shell = ACCENT_PALETTES.shell;
    expect(shell.label).toBe('Vestara Shell');
    expect(shell.hex).toBe('#2de8c3');
    expect(shell.light).toBe('#5ff0d4');
    expect(shell.dark).toBe('#10b7a0');
  });

  it('derives the shell alpha ramp from its own accent hex', () => {
    const { hex } = ACCENT_PALETTES.shell;
    expect(ACCENT_PALETTES.shell.bg).toBe(`${hex}14`);
    expect(ACCENT_PALETTES.shell.border).toBe(`${hex}40`);
    expect(ACCENT_PALETTES.shell.borderHover).toBe(`${hex}80`);
    expect(ACCENT_PALETTES.shell.borderActive).toBe(hex);
  });

  it('gives every palette a label and a complete hex ramp', () => {
    const entries = Object.entries(ACCENT_PALETTES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, palette] of entries) {
      expect(palette.label.length).toBeGreaterThan(0);
      expect(palette.hex).toMatch(HEX);
      expect(palette.light).toMatch(HEX);
      expect(palette.dark).toMatch(HEX);
      expect(palette.glow).toMatch(/^rgba\(/);
      // Border/background alphas are derived from the accent hex itself.
      expect(palette.borderActive).toBe(palette.hex);
      expect(palette.bg.slice(0, -2)).toBe(palette.hex);
      expect(palette.border.slice(0, -2)).toBe(palette.hex);
      expect(palette.borderHover.slice(0, -2)).toBe(palette.hex);
      expect(palette.bg.slice(-2)).toMatch(HEX_PAIR);
      expect(palette.border.slice(-2)).toMatch(HEX_PAIR);
      expect(palette.borderHover.slice(-2)).toMatch(HEX_PAIR);
    }
  });
});

describe('font family catalog', () => {
  it('keeps the id list in sync with the record', () => {
    expect([...FONT_FAMILY_IDS]).toEqual(Object.keys(FONT_FAMILIES));
  });

  it('labels and stacks every family uniquely', () => {
    const labels = Object.values(FONT_FAMILIES).map((family) => family.label);
    const stacks = Object.values(FONT_FAMILIES).map((family) => family.stack);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(stacks).size).toBe(stacks.length);
    for (const family of Object.values(FONT_FAMILIES)) {
      expect(family.label.length).toBeGreaterThan(0);
      expect(family.stack.length).toBeGreaterThan(0);
      expect(family.stack).toMatch(/sans-serif|serif|monospace/);
      expect(['sans', 'serif', 'mono']).toContain(family.kind);
    }
  });

  it('classifies the generic families correctly', () => {
    expect(FONT_FAMILIES.system.kind).toBe('sans');
    expect(FONT_FAMILIES.serif.kind).toBe('serif');
    expect(FONT_FAMILIES.mono.kind).toBe('mono');
  });
});

describe('font weight catalog', () => {
  it('keeps the id list in sync with the record', () => {
    expect([...FONT_WEIGHT_IDS]).toEqual(Object.keys(FONT_WEIGHTS));
  });

  it('orders the ids by ascending numeric weight', () => {
    const values = FONT_WEIGHT_IDS.map((id) => FONT_WEIGHTS[id].value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    for (const id of FONT_WEIGHT_IDS) {
      expect(FONT_WEIGHTS[id].label.length).toBeGreaterThan(0);
      expect(FONT_WEIGHTS[id].value).toBeGreaterThanOrEqual(100);
      expect(FONT_WEIGHTS[id].value).toBeLessThanOrEqual(900);
    }
  });
});
