/**
 * VES-UI-003: Canonical Design Tokens
 *
 * Establishes the canonical design token vocabulary for the Vestara UI Platform.
 * Zero runtime dependencies — pure TypeScript constants.
 *
 * Token categories: Color, Typography, Spacing, Radius, Elevation, Borders,
 * Opacity, Motion, Breakpoints, Z-index, Sizing, Density
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Color Tokens ──────────────────────────────────────────────

export const COLOR = {
  // Brand colors
  brand: {
    gold: '#d4a853',
    goldLight: '#e8c87a',
    goldDark: '#b8923a',
    green: '#22c55e',
    red: '#ef4444',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    amber: '#f59e0b',
  },

  // Semantic status colors
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    running: '#22c55e',
    idle: '#71717a',
  },

  // Zinc palette (raw values)
  zinc: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    850: '#1e1e22',
    900: '#18181b',
    950: '#09090b',
  },
} as const;

// ─── Surface Tokens ────────────────────────────────────────────

export const SURFACE = {
  canvas: 'surface.canvas',
  shell: 'surface.shell',
  panel: 'surface.panel',
  panelRaised: 'surface.panelRaised',
  overlay: 'surface.overlay',
  interactive: 'surface.interactive',
} as const;

// ─── Text Tokens ───────────────────────────────────────────────

export const TEXT = {
  primary: 'text.primary',
  secondary: 'text.secondary',
  muted: 'text.muted',
  disabled: 'text.disabled',
} as const;

// ─── Border Tokens ─────────────────────────────────────────────

export const BORDER = {
  subtle: 'border.subtle',
  default: 'border.default',
  strong: 'border.strong',
  focus: 'border.focus',
} as const;

// ─── Accent Tokens ─────────────────────────────────────────────

export const ACCENT = {
  primary: 'accent.primary',
  secondary: 'accent.secondary',
} as const;

// ─── Typography Scale ──────────────────────────────────────────

export const TYPOGRAPHY = {
  display: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: '2.25rem',
    fontWeight: '300',
    lineHeight: '1.2',
    letterSpacing: '0.02em',
  },
  pageTitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '1.5rem',
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '0',
  },
  sectionTitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '1.125rem',
    fontWeight: '600',
    lineHeight: '1.4',
    letterSpacing: '0',
  },
  panelTitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.875rem',
    fontWeight: '600',
    lineHeight: '1.4',
    letterSpacing: '0',
  },
  body: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.875rem',
    fontWeight: '400',
    lineHeight: '1.6',
    letterSpacing: '0',
  },
  bodySmall: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.75rem',
    fontWeight: '400',
    lineHeight: '1.5',
    letterSpacing: '0',
  },
  label: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.6875rem',
    fontWeight: '500',
    lineHeight: '1.4',
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
  },
  caption: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.625rem',
    fontWeight: '400',
    lineHeight: '1.4',
    letterSpacing: '0.02em',
  },
  code: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.8125rem',
    fontWeight: '400',
    lineHeight: '1.6',
    letterSpacing: '0',
  },
} as const;

// ─── Spacing Scale ─────────────────────────────────────────────

export const SPACING = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  page: '1.5rem',
  section: '1rem',
  element: '0.5rem',
} as const;

// ─── Radius Scale ──────────────────────────────────────────────

export const RADIUS = {
  none: '0',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const;

// ─── Elevation (Shadow) Tokens ─────────────────────────────────

export const ELEVATION = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
} as const;

// ─── Opacity Tokens ────────────────────────────────────────────

export const OPACITY = {
  0: '0',
  5: '0.05',
  10: '0.1',
  20: '0.2',
  25: '0.25',
  30: '0.3',
  40: '0.4',
  50: '0.5',
  60: '0.6',
  70: '0.7',
  75: '0.75',
  80: '0.8',
  90: '0.9',
  95: '0.95',
  100: '1',
} as const;

// ─── Motion Tokens ─────────────────────────────────────────────

export const MOTION = {
  fast: '100ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// ─── Breakpoint Tokens ─────────────────────────────────────────

export const BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ─── Z-Index Scale ─────────────────────────────────────────────

export const Z_INDEX = {
  base: '0',
  dropdown: '1000',
  sticky: '1100',
  overlay: '1300',
  modal: '1400',
  popover: '1500',
  toast: '1700',
  tooltip: '1800',
  max: '9999',
} as const;

// ─── Sizing Tokens ─────────────────────────────────────────────

export const SIZING = {
  sidebar: {
    width: '280px',
    collapsedWidth: '64px',
  },
  header: {
    height: '56px',
  },
  composer: {
    minHeight: '120px',
  },
  icon: {
    sm: '16px',
    md: '20px',
    lg: '24px',
  },
} as const;

// ─── Density Tokens ────────────────────────────────────────────

export const DENSITY = {
  compact: {
    spacing: SPACING[2],
    fontSize: TYPOGRAPHY.bodySmall.fontSize,
    lineHeight: '1.4',
  },
  comfortable: {
    spacing: SPACING[3],
    fontSize: TYPOGRAPHY.body.fontSize,
    lineHeight: '1.6',
  },
  spacious: {
    spacing: SPACING[4],
    fontSize: TYPOGRAPHY.body.fontSize,
    lineHeight: '1.8',
  },
} as const;
