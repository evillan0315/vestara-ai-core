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
  // Brand colors — canonical amber identity (VES-DESIGN-002 §G)
  brand: {
    amber: '#f59e0b',
    amberLight: '#fbbf24',
    amberDark: '#d97706',
    cyan: '#22d3ee',
    cyanLight: '#67e8f9',
    cyanDark: '#0891b2',
    green: '#4ade80',
    red: '#f87171',
    blue: '#60a5fa',
    purple: '#a78bfa',
    gold: '#c9a84c', // Legacy — DEPRECATED, use brand.amber
    goldLight: '#fcf6ba', // Legacy — DEPRECATED
    goldDark: '#b38728', // Legacy — DEPRECATED
  },

  // Semantic status colors (VES-DESIGN-002 §K)
  status: {
    success: '#4ade80',
    successBg: 'rgba(74, 222, 128, 0.15)',
    successBorder: 'rgba(74, 222, 128, 0.3)',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    error: '#f87171',
    errorBg: 'rgba(248, 113, 113, 0.1)',
    errorBorder: 'rgba(248, 113, 113, 0.3)',
    info: '#60a5fa',
    infoBg: 'rgba(96, 165, 250, 0.1)',
    infoBorder: 'rgba(96, 165, 250, 0.3)',
    running: '#4ade80',
    pending: '#f59e0b',
    disabled: '#52525b',
    // GA-STATE-001: runtime session status tokens
    active: '#4ade80', // busy/working — same as success/running
    idle: '#71717a', // idle — neutral muted tone
    unknown: '#52525b', // unknown — same as disabled
    // VES-UI-003: tool/files semantic tokens (cyan)
    tool: '#22d3ee',
    toolBg: 'rgba(34, 211, 238, 0.1)',
    toolBorder: 'rgba(34, 211, 238, 0.3)',
  },

  // Surface colors (VES-DESIGN-002 §P)
  surface: {
    canvas: '#09090b',
    shell: '#18181b',
    panel: '#1e1e22',
    panelRaised: '#27272a',
    overlay: 'rgba(0, 0, 0, 0.8)',
    interactive: '#27272a',
  },

  // Text colors (VES-DESIGN-002 §I)
  text: {
    primary: '#e4e4e7',
    secondary: '#a1a1aa',
    muted: '#71717a',
    disabled: '#52525b',
  },

  // Border colors (VES-DESIGN-002 §I)
  border: {
    subtle: '#27272a',
    default: '#3f3f46',
    strong: '#52525b',
    focus: '#f59e0b',
  },

  // Marketplace premium hues (VES-DESIGN-005 §M)
  // Sampled from assets/vestara-marketplace-screen.png (v1 violet gallery)
  // and assets/vestara-marketplace-02-screen.png (v2 blue gallery).
  // Categorical identity colors — identical in both appearances.
  marketplace: {
    primary: '#2f7bff', // v2 Install / pill / link blue
    violet: '#8b5cf6', // v1 primary; agent + plugin tiles
    blue: '#60a5fa', // skill + module tiles
    green: '#34d399', // provider + standards-pack tiles
    pink: '#f472b6', // theme tiles
    amber: '#fbbf24', // workflow tiles + gold ratings
    cyan: '#22d3ee', // mcp-server tiles
    orange: '#fb923c', // command tiles
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

// ─── Accent Palettes (VES-DESIGN-004) ─────────────────────────

export type AccentColorTheme =
  | 'gold'
  | 'amber'
  | 'emerald'
  | 'blue'
  | 'violet'
  | 'rose'
  | 'teal'
  | 'neutral'
  | 'orange';

export interface AccentPalette {
  readonly label: string;
  readonly hex: string;
  readonly light: string;
  readonly dark: string;
  readonly bg: string;
  readonly border: string;
  readonly borderHover: string;
  readonly borderActive: string;
}

/**
 * Accent palettes for user-selectable accent colors.
 * Migrated from @vestara/design-system ACCENT_PALETTES.
 * The default Vestara accent is amber (#f59e0b).
 */
export const ACCENT_PALETTES: Record<AccentColorTheme, AccentPalette> = {
  gold: {
    label: 'Vestara Gold',
    hex: '#D4A843',
    light: '#DFBA5A',
    dark: '#B8933A',
    bg: '#D4A84314',
    border: '#D4A84340',
    borderHover: '#D4A84380',
    borderActive: '#D4A843',
  },
  amber: {
    label: 'Amber',
    hex: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
    bg: '#f59e0b14',
    border: '#f59e0b40',
    borderHover: '#f59e0b80',
    borderActive: '#f59e0b',
  },
  emerald: {
    label: 'Emerald',
    hex: '#10b981',
    light: '#34d399',
    dark: '#059669',
    bg: '#10b98114',
    border: '#10b98140',
    borderHover: '#10b98180',
    borderActive: '#10b981',
  },
  blue: {
    label: 'Blue',
    hex: '#3b82f6',
    light: '#60a5fa',
    dark: '#2563eb',
    bg: '#3b82f614',
    border: '#3b82f640',
    borderHover: '#3b82f680',
    borderActive: '#3b82f6',
  },
  violet: {
    label: 'Violet',
    hex: '#8b5cf6',
    light: '#a78bfa',
    dark: '#7c3aed',
    bg: '#8b5cf614',
    border: '#8b5cf640',
    borderHover: '#8b5cf680',
    borderActive: '#8b5cf6',
  },
  rose: {
    label: 'Rose',
    hex: '#f43f5e',
    light: '#fb7185',
    dark: '#e11d48',
    bg: '#f43f5e14',
    border: '#f43f5e40',
    borderHover: '#f43f5e60',
    borderActive: '#f43f5e',
  },
  teal: {
    label: 'Teal',
    hex: '#14b8a6',
    light: '#2dd4bf',
    dark: '#0d9488',
    bg: '#14b8a614',
    border: '#14b8a640',
    borderHover: '#14b8a680',
    borderActive: '#14b8a6',
  },
  neutral: {
    label: 'Neutral',
    hex: '#a1a1aa',
    light: '#d4d4d8',
    dark: '#71717a',
    bg: '#a1a1aa14',
    border: '#a1a1aa40',
    borderHover: '#a1a1aa60',
    borderActive: '#a1a1aa',
  },
  orange: {
    label: 'Orange',
    hex: '#f97316',
    light: '#fb923c',
    dark: '#ea580c',
    bg: '#f9731614',
    border: '#f9731640',
    borderHover: '#f9731680',
    borderActive: '#f97316',
  },
} as const;

/** Default accent theme — canonical Vestara amber. */
export const DEFAULT_ACCENT_THEME: AccentColorTheme = 'amber';
