/**
 * Marketplace — Templates page smoke test.
 *
 * Statically renders the Templates tab (React Router memory history, effects
 * not executed) to prove the page binds its appearance axes to the canonical
 * @vestara/ui-tokens catalogs, renders every bundled theme template in the
 * preview grid, and paints only token-sourced colours — every hex in the
 * markup must come from a canonical accent palette, never an inline literal.
 */

import { ACCENT_PALETTES, FONT_FAMILIES, FONT_WEIGHT_IDS, FONT_WEIGHTS } from '@vestara/ui-tokens';
import { THEME_TEMPLATES } from '@vestara/marketplace-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Templates from '../src/pages/Marketplace/Templates';

function renderTemplates(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/marketplace/templates']}>
      <Templates />
    </MemoryRouter>,
  );
}

describe('Marketplace Templates page', () => {
  it('renders the accent, font family, and font weight axes from the canonical catalogs', () => {
    const html = renderTemplates();
    for (const palette of Object.values(ACCENT_PALETTES)) {
      expect(html).toContain(palette.label);
    }
    for (const family of Object.values(FONT_FAMILIES)) {
      expect(html).toContain(family.label);
    }
    for (const id of FONT_WEIGHT_IDS) {
      expect(html).toContain(FONT_WEIGHTS[id].label);
    }
  });

  it('renders a preview card for every bundled theme template', () => {
    const html = renderTemplates();
    for (const template of THEME_TEMPLATES) {
      expect(html).toContain(template.name);
      expect(html).toContain(`/${template.packageName}`);
    }
  });

  it('paints only canonical accent hexes and vestara custom properties', () => {
    const html = renderTemplates();
    const canonicalHexes = new Set(Object.values(ACCENT_PALETTES).map((palette) => palette.hex));
    // Only inline style declarations paint; template descriptions may quote the
    // extracted Shell ramp as prose, which is not a visual value.
    const declarations = html.match(/style="[^"]*"/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    const painted = declarations.flatMap((declaration) => declaration.match(/#[0-9a-fA-F]{6}\b/g) ?? []);
    expect(painted.length).toBeGreaterThan(0);
    const offenders = [...new Set(painted.filter((hex) => !canonicalHexes.has(hex)))];
    expect(offenders).toEqual([]);
    expect(html).toContain('var(--vestara-surface-canvas)');
  });
});
