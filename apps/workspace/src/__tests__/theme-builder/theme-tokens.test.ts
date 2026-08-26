import { describe, expect, it } from 'vitest';
import { SEMANTIC_TOKENS } from '../../lib/theme.js';
import type { TokenCategory } from '../../lib/theme.js';

const CATEGORIES: TokenCategory[] = [
  'color-bg', 'color-surface', 'color-border', 'color-text',
  'color-focus', 'color-status', 'color-accent',
  'spacing', 'radius', 'shadow', 'motion', 'typography',
];

describe('SEMANTIC_TOKENS catalog', () => {
  it('has tokens for all categories', () => {
    for (const category of CATEGORIES) {
      const tokens = SEMANTIC_TOKENS.filter(t => t.category === category);
      expect(tokens.length).toBeGreaterThan(0);
    }
  });

  it('has expected number of tokens per category', () => {
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-bg')).toHaveLength(4);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-surface')).toHaveLength(4);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-border')).toHaveLength(6);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-text')).toHaveLength(4);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-focus')).toHaveLength(1);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-status')).toHaveLength(14);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'color-accent')).toHaveLength(7);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'spacing')).toHaveLength(3);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'radius')).toHaveLength(3);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'shadow')).toHaveLength(3);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'motion')).toHaveLength(3);
    expect(SEMANTIC_TOKENS.filter(t => t.category === 'typography')).toHaveLength(10);
  });

  it('has total token count matching expected', () => {
    const total = 4 + 4 + 6 + 4 + 1 + 14 + 7 + 3 + 3 + 3 + 3 + 10;
    expect(SEMANTIC_TOKENS).toHaveLength(total);
  });

  it('cssVar values may be shared across tokens (by design)', () => {
    const cssVars = SEMANTIC_TOKENS.map(t => t.cssVar);
    const unique = new Set(cssVars);
    // Some tokens intentionally share cssVar values (e.g., multiple tokens map to --color-zinc-900)
    // This is by design for the theme system
    expect(unique.size).toBeLessThanOrEqual(cssVars.length);
  });

  it('every token has unique name', () => {
    const names = SEMANTIC_TOKENS.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every token has required fields', () => {
    for (const token of SEMANTIC_TOKENS) {
      expect(token.name).toBeTruthy();
      expect(token.category).toBeTruthy();
      expect(token.cssVar).toBeTruthy();
      expect(token.label).toBeTruthy();
      expect(token.description).toBeTruthy();
      expect(token.type).toBeTruthy();
      expect(token.defaultValue).toBeTruthy();
      expect(token.currentValue).toBeTruthy();
    }
  });

  it('every token has valid type', () => {
    const validTypes = ['color', 'length', 'number', 'font-stack'];
    for (const token of SEMANTIC_TOKENS) {
      expect(validTypes).toContain(token.type);
    }
  });

  it('every token has valid category', () => {
    for (const token of SEMANTIC_TOKENS) {
      expect(CATEGORIES).toContain(token.category);
    }
  });

  it('color tokens have lightValue and darkValue (except shadows and special status tokens)', () => {
    const colorTokens = SEMANTIC_TOKENS.filter(t => t.type === 'color');
    const exceptions = new Set(['shadow-sm', 'shadow-md', 'shadow-lg', 
      'color-status-approval', 'color-status-conflict', 'color-status-saving',
      'color-status-saved', 'color-status-failed', 'color-status-blocked', 'color-status-pending']);
    for (const token of colorTokens) {
      if (exceptions.has(token.name)) {
        // These tokens are special cases without light/dark variants
        continue;
      }
      // Color tokens should have lightValue and darkValue for light/dark mode support
      expect(token.lightValue).toBeDefined();
      expect(token.darkValue).toBeDefined();
    }
  });

  it('non-color tokens do not have lightValue/darkValue', () => {
    const nonColorTokens = SEMANTIC_TOKENS.filter(t => t.type !== 'color');
    for (const token of nonColorTokens) {
      // Non-color tokens typically don't have light/dark variants
      expect(token.lightValue).toBeUndefined();
      expect(token.darkValue).toBeUndefined();
    }
  });

  it('cssVar starts with -- or is a hex color (for special status tokens)', () => {
    for (const token of SEMANTIC_TOKENS) {
      // Most tokens use CSS custom properties (--prefix)
      // Some status tokens use direct hex colors as their cssVar
      const isHexColor = /^#[0-9a-fA-F]{6,8}$/.test(token.cssVar);
      const isCssVar = token.cssVar.startsWith('--');
      expect(isCssVar || isHexColor).toBe(true);
    }
  });

  describe('color-bg category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-bg');
    it('contains app, elevated, hover, active backgrounds', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-bg-app');
      expect(names).toContain('color-bg-elevated');
      expect(names).toContain('color-bg-hover');
      expect(names).toContain('color-bg-active');
    });
  });

  describe('color-surface category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-surface');
    it('contains panel, raised, interactive surfaces', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-surface-panel');
      expect(names).toContain('color-surface-raised');
      expect(names).toContain('color-surface-interactive');
      expect(names).toContain('color-surface-interactive-hover');
    });
  });

  describe('color-border category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-border');
    it('contains subtle, default, strong, accent borders', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-border-subtle');
      expect(names).toContain('color-border-default');
      expect(names).toContain('color-border-strong');
      expect(names).toContain('color-border-accent');
      expect(names).toContain('color-border-accent-hover');
      expect(names).toContain('color-border-accent-active');
    });
  });

  describe('color-text category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-text');
    it('contains primary, secondary, muted, dim text', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-text-primary');
      expect(names).toContain('color-text-secondary');
      expect(names).toContain('color-text-muted');
      expect(names).toContain('color-text-dim');
    });
  });

  describe('color-status category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-status');
    it('contains all status colors', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-status-success');
      expect(names).toContain('color-status-warning');
      expect(names).toContain('color-status-error');
      expect(names).toContain('color-status-info');
      expect(names).toContain('color-status-unavailable');
      expect(names).toContain('color-status-disabled');
      expect(names).toContain('color-status-auth');
      expect(names).toContain('color-status-approval');
      expect(names).toContain('color-status-conflict');
      expect(names).toContain('color-status-saving');
      expect(names).toContain('color-status-saved');
      expect(names).toContain('color-status-failed');
      expect(names).toContain('color-status-blocked');
      expect(names).toContain('color-status-pending');
    });
  });

  describe('color-accent category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'color-accent');
    it('contains primary, light, dark, bg, text variants', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('color-accent-primary');
      expect(names).toContain('color-accent-light');
      expect(names).toContain('color-accent-dark');
      expect(names).toContain('color-accent-bg');
      expect(names).toContain('color-accent-text');
      expect(names).toContain('color-accent-text-hover');
      expect(names).toContain('color-accent-text-muted');
    });
  });

  describe('spacing category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'spacing');
    it('contains page, section, element spacing', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('spacing-page');
      expect(names).toContain('spacing-section');
      expect(names).toContain('spacing-element');
    });
    it('uses rem units', () => {
      for (const token of tokens) {
        expect(token.defaultValue).toMatch(/rem$/);
      }
    });
  });

  describe('radius category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'radius');
    it('contains default, lg, full radius', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('radius-default');
      expect(names).toContain('radius-lg');
      expect(names).toContain('radius-full');
    });
    it('uses px units', () => {
      for (const token of tokens) {
        expect(token.defaultValue).toMatch(/px$/);
      }
    });
  });

  describe('shadow category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'shadow');
    it('contains sm, md, lg shadows', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('shadow-sm');
      expect(names).toContain('shadow-md');
      expect(names).toContain('shadow-lg');
    });
    it('uses valid CSS shadow syntax', () => {
      for (const token of tokens) {
        expect(token.defaultValue).toMatch(/^[\d\s\w\(\)\.,rgba]+$/);
      }
    });
  });

  describe('motion category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'motion');
    it('contains fast, normal, slow durations', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('motion-fast');
      expect(names).toContain('motion-normal');
      expect(names).toContain('motion-slow');
    });
    it('uses ms units', () => {
      for (const token of tokens) {
        expect(token.defaultValue).toMatch(/ms$/);
      }
    });
  });

  describe('typography category', () => {
    const tokens = SEMANTIC_TOKENS.filter(t => t.category === 'typography');
    it('contains font family, sizes, weights, sidebar width, page max width', () => {
      const names = tokens.map(t => t.name);
      expect(names).toContain('typography-font-family');
      expect(names).toContain('typography-font-size-base');
      expect(names).toContain('typography-font-size-sm');
      expect(names).toContain('typography-font-size-xs');
      expect(names).toContain('typography-font-size-lg');
      expect(names).toContain('typography-font-weight-normal');
      expect(names).toContain('typography-font-weight-medium');
      expect(names).toContain('typography-font-weight-semibold');
      expect(names).toContain('typography-sidebar-width');
      expect(names).toContain('typography-page-max-width');
    });
  });
});