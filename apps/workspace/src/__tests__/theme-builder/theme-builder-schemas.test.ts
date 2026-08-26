import { describe, expect, it } from 'vitest';
import {
  CustomThemeSchema,
  safeValidateCustomTheme,
  safeValidateThemeArray,
  SemanticTokenSchema,
  ThemeSettingsSchema,
  TokenCategorySchema,
  TuiSemanticPaletteSchema,
  validateCustomTheme,
} from '../../../lib/theme-builder-schemas.js';

describe('TokenCategorySchema', () => {
  it('accepts valid categories', () => {
    const validCategories = [
      'color-bg', 'color-surface', 'color-border', 'color-text',
      'color-focus', 'color-status', 'color-accent',
      'spacing', 'radius', 'shadow', 'motion', 'typography',
    ];
    for (const cat of validCategories) {
      expect(TokenCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it('rejects invalid categories', () => {
    expect(TokenCategorySchema.safeParse('invalid').success).toBe(false);
    expect(TokenCategorySchema.safeParse('').success).toBe(false);
  });
});

describe('SemanticTokenSchema', () => {
  it('validates a complete color token', () => {
    const token = {
      name: 'color-accent-primary',
      category: 'color-accent' as const,
      cssVar: '--vestara-accent',
      label: 'Accent Primary',
      description: 'Primary accent color',
      type: 'color' as const,
      defaultValue: '#f59e0b',
      currentValue: '#f59e0b',
      lightValue: '#b45309',
      darkValue: '#f59e0b',
    };
    expect(SemanticTokenSchema.safeParse(token).success).toBe(true);
  });

  it('validates a length token', () => {
    const token = {
      name: 'spacing-page',
      category: 'spacing' as const,
      cssVar: '--vestara-spacing-page',
      label: 'Page Spacing',
      description: 'Page-level padding/margin',
      type: 'length' as const,
      defaultValue: '1rem',
      currentValue: '1rem',
    };
    expect(SemanticTokenSchema.safeParse(token).success).toBe(true);
  });

  it('validates a font-stack token', () => {
    const token = {
      name: 'typography-font-family',
      category: 'typography' as const,
      cssVar: '--vestara-font-family',
      label: 'Font Family',
      description: 'Base font family stack',
      type: 'font-stack' as const,
      defaultValue: 'system-ui, sans-serif',
      currentValue: 'system-ui, sans-serif',
    };
    expect(SemanticTokenSchema.safeParse(token).success).toBe(true);
  });

  it('rejects token with missing required fields', () => {
    const token = {
      name: 'color-accent-primary',
      category: 'color-accent',
      cssVar: '--vestara-accent',
    };
    const result = SemanticTokenSchema.safeParse(token);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects token with invalid cssVar (must start with --)', () => {
    const token = {
      name: 'color-accent-primary',
      category: 'color-accent' as const,
      cssVar: 'vestara-accent',
      label: 'Accent Primary',
      description: 'Primary accent color',
      type: 'color' as const,
      defaultValue: '#f59e0b',
      currentValue: '#f59e0b',
    };
    expect(SemanticTokenSchema.safeParse(token).success).toBe(false);
  });

  it('rejects token with invalid type', () => {
    const token = {
      name: 'color-accent-primary',
      category: 'color-accent' as const,
      cssVar: '--vestara-accent',
      label: 'Accent Primary',
      description: 'Primary accent color',
      type: 'invalid' as const,
      defaultValue: '#f59e0b',
      currentValue: '#f59e0b',
    };
    expect(SemanticTokenSchema.safeParse(token).success).toBe(false);
  });
});

describe('ThemeSettingsSchema', () => {
  const validSettings = {
    fontFamily: 'system' as const,
    fontSize: 'medium' as const,
    fontWeight: 'normal' as const,
    sidebarWidth: 'normal' as const,
    spacing: 'comfortable' as const,
    radius: 'medium' as const,
    fullWidth: true,
    fullScreen: false,
    sidebarEnabled: true,
    sidebarMode: 'text' as const,
    leftBorderEnabled: true,
    leftBorderColor: '#f59e0b',
    leftBorderThickness: 4,
    colorTheme: 'gold' as const,
  };

  it('validates complete theme settings', () => {
    expect(ThemeSettingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it('validates partial theme settings', () => {
    expect(ThemeSettingsSchema.partial().safeParse({ colorTheme: 'emerald' }).success).toBe(true);
  });

  it('rejects invalid fontFamily', () => {
    expect(ThemeSettingsSchema.safeParse({ ...validSettings, fontFamily: 'invalid' }).success).toBe(false);
  });

  it('rejects invalid colorTheme', () => {
    expect(ThemeSettingsSchema.safeParse({ ...validSettings, colorTheme: 'invalid' }).success).toBe(false);
  });

  it('rejects negative leftBorderThickness', () => {
    expect(ThemeSettingsSchema.safeParse({ ...validSettings, leftBorderThickness: -1 }).success).toBe(false);
  });

  it('accepts zero leftBorderThickness', () => {
    expect(ThemeSettingsSchema.safeParse({ ...validSettings, leftBorderThickness: 0 }).success).toBe(true);
  });
});

describe('TuiSemanticPaletteSchema', () => {
  it('validates complete TUI palette', () => {
    const palette = {
      accent: '#f59e0b',
      accentBright: '#fbbf24',
      accentDim: '#d97706',
      background: '#09090b',
      backgroundPanel: '#18181b',
      backgroundElement: '#27272a',
      text: '#e4e4e7',
      textMuted: '#a1a1aa',
      textDim: '#71717a',
      border: '#3f3f46',
      borderActive: '#f59e0b',
      success: '#4ade80',
      warning: '#f59e0b',
      error: '#f87171',
      info: '#60a5fa',
      focus: '#f59e0b',
    };
    expect(TuiSemanticPaletteSchema.safeParse(palette).success).toBe(true);
  });

  it('validates partial TUI palette (all fields optional)', () => {
    expect(TuiSemanticPaletteSchema.safeParse({ accent: '#f59e0b' }).success).toBe(true);
    expect(TuiSemanticPaletteSchema.safeParse({}).success).toBe(true);
  });
});

describe('CustomThemeSchema', () => {
  const validTheme = {
    id: 'custom-123',
    name: 'Test Theme',
    description: 'A test theme',
    author: 'Test Author',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isBuiltIn: false,
    baseThemeId: 'gold',
    tokens: { '--vestara-accent': '#f59e0b' },
    lightTokens: {},
    darkTokens: {},
    profile: { colorTheme: 'gold' },
    tuiPalette: { accent: '#f59e0b' },
  };

  it('validates a complete custom theme', () => {
    expect(CustomThemeSchema.safeParse(validTheme).success).toBe(true);
  });

  it('validates a built-in theme with built-in- prefix', () => {
    const builtIn = { ...validTheme, id: 'built-in-gold-default', isBuiltIn: true };
    expect(CustomThemeSchema.safeParse(builtIn).success).toBe(true);
  });

  it('validates a custom theme with custom- prefix', () => {
    const custom = { ...validTheme, id: 'custom-abc' };
    expect(CustomThemeSchema.safeParse(custom).success).toBe(true);
  });

  it('validates UUID id', () => {
    const uuidTheme = { ...validTheme, id: '550e8400-e29b-41d4-a716-446655440000' };
    expect(CustomThemeSchema.safeParse(uuidTheme).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CustomThemeSchema.safeParse({ ...validTheme, name: '' }).success).toBe(false);
  });

  it('rejects name longer than 100 chars', () => {
    expect(CustomThemeSchema.safeParse({ ...validTheme, name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects description longer than 500 chars', () => {
    expect(CustomThemeSchema.safeParse({ ...validTheme, description: 'a'.repeat(501) }).success).toBe(false);
  });

  it('rejects author longer than 100 chars', () => {
    expect(CustomThemeSchema.safeParse({ ...validTheme, author: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects invalid datetime format', () => {
    expect(CustomThemeSchema.safeParse({ ...validTheme, createdAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const incomplete = { id: 'custom-123', name: 'Test' };
    expect(CustomThemeSchema.safeParse(incomplete).success).toBe(false);
  });
});

describe('validateCustomTheme', () => {
  const validTheme = {
    id: 'custom-123',
    name: 'Test Theme',
    description: 'A test theme',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isBuiltIn: false,
    baseThemeId: 'gold',
    tokens: { '--vestara-accent': '#f59e0b' },
    lightTokens: {},
    darkTokens: {},
    profile: { colorTheme: 'gold' },
  };

  it('returns parsed theme for valid input', () => {
    const result = validateCustomTheme(validTheme);
    expect(result.name).toBe('Test Theme');
    expect(result.id).toBe('custom-123');
  });

  it('throws ZodError for invalid input', () => {
    expect(() => validateCustomTheme({ ...validTheme, name: '' })).toThrow();
  });
});

describe('safeValidateCustomTheme', () => {
  const validTheme = {
    id: 'custom-123',
    name: 'Test Theme',
    description: 'A test theme',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00.000Z',
    isBuiltIn: false,
    baseThemeId: 'gold',
    tokens: { '--vestara-accent': '#f59e0b' },
    lightTokens: {},
    darkTokens: {},
    profile: { colorTheme: 'gold' },
  };

  it('returns success with data for valid theme', () => {
    const result = safeValidateCustomTheme(validTheme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test Theme');
    }
  });

  it('returns error for invalid theme', () => {
    const result = safeValidateCustomTheme({ ...validTheme, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

describe('safeValidateThemeArray', () => {
  const validTheme = {
    id: 'custom-123',
    name: 'Test Theme',
    description: 'A test theme',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isBuiltIn: false,
    baseThemeId: 'gold',
    tokens: { '--vestara-accent': '#f59e0b' },
    lightTokens: {},
    darkTokens: {},
    profile: { colorTheme: 'gold' },
  };

  it('returns success with array for valid themes', () => {
    const result = safeValidateThemeArray([validTheme, { ...validTheme, id: 'custom-456' }]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it('returns error for invalid theme in array', () => {
    const result = safeValidateThemeArray([validTheme, { ...validTheme, name: '' }]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it('returns error for non-array input', () => {
    const result = safeValidateThemeArray('not an array');
    expect(result.success).toBe(false);
  });
});