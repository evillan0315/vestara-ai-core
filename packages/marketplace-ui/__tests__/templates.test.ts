/**
 * @vestara/marketplace-ui — theme template contracts.
 *
 * Proves the Templates tab's merged authority: every theme template binds
 * its accent / font family / font weight to the canonical @vestara/ui-tokens
 * catalogs, surface ramps reference only `var(--vestara-*)` custom
 * properties, and the reference fixtures mirror their template metadata.
 * Fixtures are fallback reference content — never presented as live data.
 */

import { ACCENT_PALETTES, FONT_FAMILIES, FONT_FAMILY_IDS, FONT_WEIGHT_IDS, FONT_WEIGHTS } from '@vestara/ui-tokens';
import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_COUNT,
  THEME_TEMPLATE_FIXTURES,
  THEME_TEMPLATES,
  templateAccent,
  templateFontFamily,
  templateFontWeight,
} from '../src/index';

const SHELL_ACCENT_HEX = '#2de8c3';
const VESTARA_VAR = /^var\(--vestara-[a-z0-9-]+\)$/;

describe('theme templates', () => {
  it('bundles one reference template per advertised count', () => {
    expect(TEMPLATE_COUNT).toBe(THEME_TEMPLATES.length);
    expect(TEMPLATE_COUNT).toBeGreaterThan(0);
    expect(THEME_TEMPLATE_FIXTURES.length).toBe(TEMPLATE_COUNT);
  });

  it('keeps template ids and package names unique', () => {
    expect(new Set(THEME_TEMPLATES.map((template) => template.id)).size).toBe(TEMPLATE_COUNT);
    expect(new Set(THEME_TEMPLATES.map((template) => template.packageName)).size).toBe(TEMPLATE_COUNT);
  });

  it('resolves every appearance axis through the canonical token catalogs', () => {
    for (const template of THEME_TEMPLATES) {
      expect(Object.keys(ACCENT_PALETTES)).toContain(template.accent);
      expect(FONT_FAMILY_IDS).toContain(template.fontFamily);
      expect(FONT_WEIGHT_IDS).toContain(template.fontWeight);
      expect(templateAccent(template)).toBe(ACCENT_PALETTES[template.accent]);
      expect(templateFontFamily(template)).toBe(FONT_FAMILIES[template.fontFamily]);
      expect(templateFontWeight(template)).toBe(FONT_WEIGHTS[template.fontWeight]);
    }
  });

  it('references only vestara custom properties in every surface ramp', () => {
    for (const template of THEME_TEMPLATES) {
      const names = template.surfaces.map((swatch) => swatch.name);
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
      for (const swatch of template.surfaces) {
        expect(swatch.token).toMatch(VESTARA_VAR);
      }
      expect(template.displayAccent).toMatch(VESTARA_VAR);
    }
  });

  it('carries the extracted Shell Foundation accent on the shell template', () => {
    const shell = THEME_TEMPLATES.find((template) => template.id === 'shell-foundation');
    expect(shell).toBeDefined();
    expect(shell?.accent).toBe('shell');
    expect(shell && templateAccent(shell).hex).toBe(SHELL_ACCENT_HEX);
    expect(shell && templateAccent(shell).label).toBe('Vestara Shell');
  });
});

describe('theme template fixtures', () => {
  it('mirrors template metadata onto reference assets', () => {
    const byPackageName = new Map(THEME_TEMPLATE_FIXTURES.map((fixture) => [fixture.asset.packageName, fixture]));
    expect(byPackageName.size).toBe(TEMPLATE_COUNT);
    for (const template of THEME_TEMPLATES) {
      const fixture = byPackageName.get(template.packageName);
      expect(fixture).toBeDefined();
      expect(fixture?.asset.id).toBe(`fixture/${template.publisherId}/${template.packageName}`);
      expect(fixture?.asset.displayName).toBe(template.name);
      expect(fixture?.asset.summary).toBe(template.description);
      expect(fixture?.asset.publisherId).toBe(template.publisherId);
      expect(fixture?.asset.type).toBe('theme');
      expect(fixture?.asset.visibility).toBe('public');
      expect(fixture?.asset.tags).toEqual([...template.tags]);
      expect(fixture?.asset.latestVersion).toBe(template.version);
      expect(fixture?.asset.versions[0]?.version).toBe(template.version);
      expect(fixture?.display.glyph).toBe(template.glyph);
      expect(fixture?.display.accent).toBe(template.displayAccent);
    }
  });

  it('never back-dates or future-dates a reference asset', () => {
    const now = Date.now();
    for (const { asset } of THEME_TEMPLATE_FIXTURES) {
      const updatedAt = Date.parse(asset.updatedAt);
      expect(Number.isNaN(updatedAt)).toBe(false);
      expect(updatedAt).toBeLessThanOrEqual(now);
      expect(asset.updatedAt).toBe(asset.createdAt);
    }
  });
});
