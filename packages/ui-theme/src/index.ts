/**
 * @vestara/ui-theme — Canonical Theme Authority
 *
 * Provides VestaraThemeProvider and related types for MUI/React theme integration.
 * Depends on @vestara/ui-tokens (Layer 0) for canonical token values.
 *
 * Architecture:
 *   @vestara/ui-tokens (Layer 0) → @vestara/ui-theme (Layer 1) → apps
 *
 * Architecture Traceability:
 *   VES-DESIGN-004: Theme Authority Integration
 *   @see docs/architecture/VES-DESIGN-002-CANONICAL-TOKEN-CONTRACT.md
 */

export type {
  AccentColorTheme,
  AccentPalette,
  Theme,
} from '@vestara/ui-tokens';
// Re-export canonical tokens for convenience
export {
  ACCENT_PALETTES,
  DARK_THEME,
  DEFAULT_ACCENT_THEME,
  LIGHT_THEME,
} from '@vestara/ui-tokens';
export type {
  ThemeMode,
  VestaraThemeProviderProps,
  VestaraThemeState,
} from './VestaraThemeProvider.js';
export {
  useVestaraTheme,
  VestaraThemeProvider,
} from './VestaraThemeProvider.js';
