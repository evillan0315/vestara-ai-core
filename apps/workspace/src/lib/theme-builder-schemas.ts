import { z } from 'zod';
import type { CustomTheme, SemanticToken, ThemeBuilderState, ThemeSettings, TokenCategory } from './theme';

export const TokenCategorySchema: z.ZodEnum<[TokenCategory, ...TokenCategory[]]> = z.enum([
  'color-bg',
  'color-surface',
  'color-border',
  'color-text',
  'color-focus',
  'color-status',
  'color-accent',
  'spacing',
  'radius',
  'shadow',
  'motion',
  'typography',
]);

export const SemanticTokenSchema = z.object({
  name: z.string().min(1),
  category: TokenCategorySchema,
  cssVar: z.string().startsWith('--'),
  label: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['color', 'length', 'number', 'font-stack']),
  defaultValue: z.string().min(1),
  currentValue: z.string().min(1),
  lightValue: z.string().optional(),
  darkValue: z.string().optional(),
});

export const ThemeSettingsSchema = z.object({
  fontFamily: z.enum(['system', 'serif', 'mono']),
  fontSize: z.enum(['small', 'medium', 'large']),
  fontWeight: z.enum(['normal', 'medium', 'semibold']),
  sidebarWidth: z.enum(['compact', 'normal', 'wide']),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  radius: z.enum(['none', 'small', 'medium', 'large']),
  fullWidth: z.boolean(),
  fullScreen: z.boolean(),
  sidebarEnabled: z.boolean(),
  sidebarMode: z.enum(['icons', 'text']),
  leftBorderEnabled: z.boolean(),
  leftBorderColor: z.string(),
  leftBorderThickness: z.number().int().nonnegative(),
  colorTheme: z.enum(['gold', 'amber', 'emerald', 'blue', 'violet', 'rose', 'teal', 'neutral', 'orange']),
});

export const TuiSemanticPaletteSchema = z
  .object({
    accent: z.string(),
    accentBright: z.string(),
    accentDim: z.string(),
    background: z.string(),
    backgroundPanel: z.string(),
    backgroundElement: z.string(),
    text: z.string(),
    textMuted: z.string(),
    textDim: z.string(),
    border: z.string(),
    borderActive: z.string(),
    success: z.string(),
    warning: z.string(),
    error: z.string(),
    info: z.string(),
    focus: z.string(),
  })
  .partial();

export const CustomThemeSchema = z.object({
  id: z
    .string()
    .uuid()
    .or(z.string().startsWith('built-in-').or(z.string().startsWith('custom-'))),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  author: z.string().max(100).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isBuiltIn: z.boolean(),
  baseThemeId: z.string().min(1),
  tokens: z.record(z.string(), z.string()),
  lightTokens: z.record(z.string(), z.string()).optional(),
  darkTokens: z.record(z.string(), z.string()).optional(),
  profile: ThemeSettingsSchema.partial(),
  tuiPalette: TuiSemanticPaletteSchema.optional(),
});

export const ThemeBuilderStateSchema = z.object({
  editingTheme: CustomThemeSchema.nullable(),
  previewMode: z.boolean(),
  customThemes: z.array(CustomThemeSchema),
  builtInThemes: z.array(CustomThemeSchema),
});

export type SemanticTokenValidated = z.infer<typeof SemanticTokenSchema>;
export type CustomThemeValidated = z.infer<typeof CustomThemeSchema>;
export type ThemeBuilderStateValidated = z.infer<typeof ThemeBuilderStateSchema>;

export function validateSemanticToken(data: unknown): SemanticTokenValidated {
  return SemanticTokenSchema.parse(data);
}

export function validateCustomTheme(data: unknown): CustomThemeValidated {
  return CustomThemeSchema.parse(data);
}

export function validateThemeBuilderState(data: unknown): ThemeBuilderStateValidated {
  return ThemeBuilderStateSchema.parse(data);
}

export function safeValidateCustomTheme(
  data: unknown,
): { success: true; data: CustomThemeValidated } | { success: false; error: z.ZodError } {
  const result = CustomThemeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeValidateThemeArray(
  data: unknown,
): { success: true; data: CustomThemeValidated[] } | { success: false; error: z.ZodError } {
  const result = z.array(CustomThemeSchema).safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function serializeThemeForExport(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

export function serializeThemesForExport(themes: CustomTheme[]): string {
  return JSON.stringify(themes, null, 2);
}

export function parseImportedTheme(json: string): CustomThemeValidated {
  const parsed = JSON.parse(json);
  return validateCustomTheme(parsed);
}

export function parseImportedThemes(json: string): CustomThemeValidated[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Imported themes must be an array');
  }
  return parsed.map(validateCustomTheme);
}

export function generateShareableUrl(theme: CustomTheme): string {
  const base64 = btoa(serializeThemeForExport(theme));
  return `${window.location.origin}${window.location.pathname}?theme=${encodeURIComponent(base64)}`;
}

export function parseThemeFromUrl(url: string): CustomThemeValidated | null {
  try {
    const params = new URLSearchParams(new URL(url).search);
    const encoded = params.get('theme');
    if (!encoded) return null;
    const json = atob(decodeURIComponent(encoded));
    return parseImportedTheme(json);
  } catch {
    return null;
  }
}
