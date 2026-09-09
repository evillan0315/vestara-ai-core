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
  COLOR,
  SURFACE,
  TEXT,
  BORDER,
  ACCENT,
  TYPOGRAPHY,
  SPACING,
  RADIUS,
  ELEVATION,
  OPACITY,
  MOTION,
  BREAKPOINTS,
  Z_INDEX,
  SIZING,
  DENSITY,
} from './tokens.js';

export type { ThemeMode } from './themes.js';
export {
  DARK_THEME,
  LIGHT_THEME,
  THEMES,
} from './themes.js';
export type {
  SurfaceTheme,
  TextTheme,
  BorderTheme,
  AccentTheme,
  StatusTheme,
  Theme,
} from './themes.js';

export {
  generateCSSVariables,
  generateRootCSS,
  generateThemeCSS,
  applyCSSVariables,
} from './css.js';
