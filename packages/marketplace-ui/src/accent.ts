/**
 * @vestara/marketplace-ui — Theme Accent Wiring
 *
 * Binds the Discover gallery to the runtime theme accent palette.
 * `theme.tsx` sets the dynamic `--vestara-accent*` variables from the
 * selected `ACCENT_PALETTES` entry at runtime (user-selectable: amber,
 * blue, violet, gold, …); this module is the gallery's contract onto
 * those variables, plus pure helpers for non-CSS contexts.
 *
 * What follows the theme accent vs what stays categorical:
 *   - FOLLOW: gallery chrome — tabs, pills, skeleton, hairlines, hovers,
 *     glows (`DISCOVER_ACCENT`, all `var(--vestara-accent*)` references) —
 *     AND primary actions: Install buttons, active pills, links, badges,
 *     hero washes. The workspace derived layer pins
 *     `--vestara-marketplace-primary*` onto `--vestara-accent`, so
 *     `DISCOVER_COLORS.primary` resolves to the live accent at runtime.
 *   - STATIC: categorical tile identity hues (agent/skill/provider/…)
 *     (`DISCOVER_COLORS` / `TYPE_ACCENTS` — VES-DESIGN-005 §M).
 *
 * Architecture Traceability:
 *   VES-DESIGN-004: accent palettes (authority: @vestara/ui-tokens)
 *   PCS-023: workspace profiles (presentation → blue accent)
 */

import { ACCENT_PALETTES, type AccentColorTheme, type AccentPalette, DEFAULT_ACCENT_THEME } from '@vestara/ui-tokens';

export type { AccentColorTheme, AccentPalette };
export { ACCENT_PALETTES, DEFAULT_ACCENT_THEME };

// ─── Dynamic Runtime Contract ───────────────────────────────────
// Every variable below is set by theme.tsx `applySettings` from the active
// palette (or derived in workspace index.css from `--vestara-accent`).
// Gallery treatments MUST reference these — never palette hex — so the
// gallery follows accent switches with zero re-render.

export const MARKETPLACE_ACCENT_VARS = {
  accent: '--vestara-accent',
  light: '--vestara-accent-light',
  dark: '--vestara-accent-dark',
  glow: '--vestara-accent-glow',
  bg: '--vestara-accent-bg',
  border: '--vestara-accent-border',
  borderHover: '--vestara-accent-border-hover',
  borderActive: '--vestara-accent-border-active',
  text: '--vestara-accent-text',
  textHover: '--vestara-accent-text-hover',
  textMuted: '--vestara-accent-text-muted',
} as const;

// ─── Gallery Chrome Treatments ──────────────────────────────────
// Which dynamic treatment each chrome role uses. Components and the
// gallery stylesheet resolve through this map.

export const DISCOVER_ACCENT = {
  /** Active tab text, install affordance fallback, rail accents. */
  accent: 'var(--vestara-accent)',
  /** Text on accent-tinted surfaces. */
  text: 'var(--vestara-accent-text)',
  /** Soft accent wash (tab hovers, category rows, skeleton). */
  wash: 'var(--vestara-accent-bg)',
  /** Hairlines and card borders at rest. */
  hairline: 'var(--vestara-accent-border)',
  /** Hairlines and card borders on hover. */
  hairlineHover: 'var(--vestara-accent-border-hover)',
  /** Card hover glow. */
  glow: 'var(--vestara-surface-glow-hover)',
  /** Catch-all fallback for unmapped asset types. */
  fallback: 'var(--vestara-accent)',
} as const;

// ─── Pure Helpers (non-CSS contexts) ────────────────────────────

/**
 * Resolve the palette for a theme name. Defaults to the canonical
 * Vestara amber when no theme is given — for canvas/SVG/test contexts
 * that cannot read CSS variables.
 */
export function resolveAccentPalette(theme?: AccentColorTheme): AccentPalette {
  return ACCENT_PALETTES[theme ?? DEFAULT_ACCENT_THEME];
}

/**
 * `color-mix` glow shadow for an accent token reference.
 * Defaults to the live theme accent so glows follow accent switches.
 */
export function accentGlow(accent: string = DISCOVER_ACCENT.accent, amount = 45): string {
  return `0 0 12px color-mix(in srgb, ${accent} ${amount}%, transparent)`;
}

// ─── Selected-Accent Primary (non-CSS hosts) ────────────────────

export interface MarketplacePrimary {
  /** Solid primary treatment — the selected accent hex. */
  primary: string;
  /** Soft primary wash — the palette bg (accent at low alpha). */
  primaryBg: string;
  /** Primary hairline — the palette border. */
  primaryBorder: string;
}

/**
 * Marketplace primary treatments for the selected accent palette.
 * Mirrors the workspace derived layer (`--vestara-marketplace-primary*`
 * pinned onto `--vestara-accent`) for hosts that cannot read CSS
 * variables — canvas, SVG export, tests, external embeds.
 */
export function marketplacePrimaryForTheme(theme: AccentColorTheme = DEFAULT_ACCENT_THEME): MarketplacePrimary {
  const palette = resolveAccentPalette(theme);
  return { primary: palette.hex, primaryBg: palette.bg, primaryBorder: palette.border };
}
