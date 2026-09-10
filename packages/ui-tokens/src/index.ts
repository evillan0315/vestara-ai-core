/**
 * @vestara/ui-tokens — Canonical Design Tokens
 *
 * Zero runtime dependencies — pure TypeScript constants.
 * Establishes the canonical design token vocabulary for the Vestara UI Platform.
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

export {
  applyCSSVariables,
  generateCSSVariables,
  generateRootCSS,
  generateThemeCSS,
} from './css.js';
export type {
  AccentTheme,
  BorderTheme,
  StatusTheme,
  SurfaceTheme,
  TextTheme,
  Theme,
  ThemeMode,
} from './themes.js';
export {
  DARK_THEME,
  LIGHT_THEME,
  THEMES,
} from './themes.js';
export {
  ACCENT,
  BORDER,
  BREAKPOINTS,
  COLOR,
  DENSITY,
  ELEVATION,
  MOTION,
  OPACITY,
  RADIUS,
  SIZING,
  SPACING,
  SURFACE,
  TEXT,
  TYPOGRAPHY,
  Z_INDEX,
} from './tokens.js';
