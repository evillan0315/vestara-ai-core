/**
 * @vestara/ui-tokens — UI component palette (VES-DESIGN-006) contracts.
 *
 * Proves the extracted OS component palette exists as canonical tokens and
 * that every value aliases a dynamic `var(--vestara-*)` token, so the
 * component library follows the selected theme mode, accent palette, and
 * workspace profile — and no @vestara/ui-components file ever needs a raw
 * hex literal.
 */

import { describe, expect, it } from 'vitest';
import { DARK_THEME, generateCSSVariables, LIGHT_THEME, UI_COMPONENT } from '../src/index';

describe('UI_COMPONENT token palette', () => {
  it('defines the OS surface, ink, accent, status and colour groups as dynamic aliases', () => {
    expect(UI_COMPONENT.surface.canvas).toMatch(/^var\(--vestara-/);
    expect(UI_COMPONENT.text.primary).toMatch(/^var\(--vestara-/);
    expect(UI_COMPONENT.border.subtle).toMatch(/^var\(--vestara-/);
    expect(UI_COMPONENT.accent.teal).toMatch(/^var\(--vestara-/);
    expect(UI_COMPONENT.status.success).toMatch(/^var\(--vestara-/);
    expect(UI_COMPONENT.color.inverse).toMatch(/^var\(--vestara-/);
  });

  it('routes the accent group onto the selected accent palette', () => {
    expect(UI_COMPONENT.accent.teal).toBe('var(--vestara-accent)');
    expect(UI_COMPONENT.accent.cyan).toBe('var(--vestara-accent-light)');
    expect(UI_COMPONENT.color.onAccent).toBe('var(--vestara-on-accent)');
  });

  it('emits every palette value as a --vestara-*-os-* variable', () => {
    const vars = generateCSSVariables(DARK_THEME);
    expect(vars['--vestara-surface-os-canvas']).toBe(UI_COMPONENT.surface.canvas);
    expect(vars['--vestara-surface-os-panel']).toBe(UI_COMPONENT.surface.panel);
    expect(vars['--vestara-surface-os-raised']).toBe(UI_COMPONENT.surface.raised);
    expect(vars['--vestara-border-os-subtle']).toBe(UI_COMPONENT.border.subtle);
    expect(vars['--vestara-text-os-primary']).toBe(UI_COMPONENT.text.primary);
    expect(vars['--vestara-accent-os-teal']).toBe(UI_COMPONENT.accent.teal);
    expect(vars['--vestara-accent-os-cyan']).toBe(UI_COMPONENT.accent.cyan);
    expect(vars['--vestara-status-os-success']).toBe(UI_COMPONENT.status.success);
    expect(vars['--vestara-color-os-inverse']).toBe(UI_COMPONENT.color.inverse);
  });

  it('keeps the OS palette aliased (not inlined) in dark and light appearances', () => {
    const dark = generateCSSVariables(DARK_THEME);
    const light = generateCSSVariables(LIGHT_THEME);
    expect(dark['--vestara-surface-os-canvas']).toBe('var(--vestara-surface-canvas)');
    expect(dark['--vestara-surface-os-canvas']).toBe(light['--vestara-surface-os-canvas']);
    expect(dark['--vestara-accent-os-teal']).toBe('var(--vestara-accent)');
  });
});
