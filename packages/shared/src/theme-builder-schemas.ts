import { z } from 'zod';

export type TokenCategory =
  | 'color-bg'
  | 'color-surface'
  | 'color-border'
  | 'color-text'
  | 'color-focus'
  | 'color-status'
  | 'color-accent'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'motion'
  | 'typography';

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

export type CustomTheme = z.infer<typeof CustomThemeSchema>;
export type SemanticToken = z.infer<typeof SemanticTokenSchema>;
export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;

export function validateCustomTheme(data: unknown): CustomTheme {
  return CustomThemeSchema.parse(data);
}

export function safeValidateCustomTheme(
  data: unknown,
): { success: true; data: CustomTheme } | { success: false; error: z.ZodError } {
  const result = CustomThemeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeValidateThemeArray(
  data: unknown,
): { success: true; data: CustomTheme[] } | { success: false; error: z.ZodError } {
  const result = z.array(CustomThemeSchema).safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
