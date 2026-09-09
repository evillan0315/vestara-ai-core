/**
 * VES-UI-003: Theme Tokens (Dark/Light Mode)
 *
 * Defines semantic color mappings for dark and light themes.
 * Maps abstract surface/text/border tokens to concrete color values.
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { COLOR } from './tokens.js';

// ─── Theme Type ────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light';

// ─── Surface Theme ─────────────────────────────────────────────

export interface SurfaceTheme {
  canvas: string;
  shell: string;
  panel: string;
  panelRaised: string;
  overlay: string;
  interactive: string;
}

// ─── Text Theme ────────────────────────────────────────────────

export interface TextTheme {
  primary: string;
  secondary: string;
  muted: string;
  disabled: string;
}

// ─── Border Theme ──────────────────────────────────────────────

export interface BorderTheme {
  subtle: string;
  default: string;
  strong: string;
  focus: string;
}

// ─── Accent Theme ──────────────────────────────────────────────

export interface AccentTheme {
  primary: string;
  secondary: string;
  bg: string;
  border: string;
  borderHover: string;
  borderActive: string;
  text: string;
  textHover: string;
  textMuted: string;
}

// ─── Status Theme ──────────────────────────────────────────────

export interface StatusTheme {
  success: string;
  warning: string;
  error: string;
  info: string;
  running: string;
  idle: string;
}

// ─── Complete Theme ────────────────────────────────────────────

export interface Theme {
  mode: ThemeMode;
  surface: SurfaceTheme;
  text: TextTheme;
  border: BorderTheme;
  accent: AccentTheme;
  status: StatusTheme;
}

// ─── Dark Theme ────────────────────────────────────────────────

export const DARK_THEME: Theme = {
  mode: 'dark',
  surface: {
    canvas: COLOR.zinc[950],
    shell: COLOR.zinc[900],
    panel: COLOR.zinc[850],
    panelRaised: COLOR.zinc[800],
    overlay: 'rgba(0, 0, 0, 0.8)',
    interactive: COLOR.zinc[800],
  },
  text: {
    primary: COLOR.zinc[100],
    secondary: COLOR.zinc[300],
    muted: COLOR.zinc[500],
    disabled: COLOR.zinc[600],
  },
  border: {
    subtle: COLOR.zinc[800],
    default: COLOR.zinc[700],
    strong: COLOR.zinc[600],
    focus: COLOR.brand.gold,
  },
  accent: {
    primary: COLOR.brand.gold,
    secondary: COLOR.brand.goldLight,
    bg: `${COLOR.brand.gold}15`,
    border: `${COLOR.brand.gold}40`,
    borderHover: `${COLOR.brand.gold}60`,
    borderActive: COLOR.brand.gold,
    text: COLOR.brand.gold,
    textHover: COLOR.brand.goldLight,
    textMuted: `${COLOR.brand.gold}99`,
  },
  status: {
    success: COLOR.status.success,
    warning: COLOR.status.warning,
    error: COLOR.status.error,
    info: COLOR.status.info,
    running: COLOR.status.running,
    idle: COLOR.status.idle,
  },
};

// ─── Light Theme ───────────────────────────────────────────────

export const LIGHT_THEME: Theme = {
  mode: 'light',
  surface: {
    canvas: '#f8f9fa',
    shell: '#ffffff',
    panel: '#ffffff',
    panelRaised: '#f8f9fa',
    overlay: 'rgba(0, 0, 0, 0.5)',
    interactive: '#f1f3f5',
  },
  text: {
    primary: COLOR.zinc[900],
    secondary: COLOR.zinc[700],
    muted: COLOR.zinc[500],
    disabled: COLOR.zinc[400],
  },
  border: {
    subtle: COLOR.zinc[200],
    default: COLOR.zinc[300],
    strong: COLOR.zinc[400],
    focus: COLOR.brand.gold,
  },
  accent: {
    primary: COLOR.brand.gold,
    secondary: COLOR.brand.goldDark,
    bg: `${COLOR.brand.gold}10`,
    border: `${COLOR.brand.gold}30`,
    borderHover: `${COLOR.brand.gold}50`,
    borderActive: COLOR.brand.gold,
    text: COLOR.brand.goldDark,
    textHover: COLOR.brand.gold,
    textMuted: `${COLOR.brand.gold}80`,
  },
  status: {
    success: COLOR.status.success,
    warning: COLOR.status.warning,
    error: COLOR.status.error,
    info: COLOR.status.info,
    running: COLOR.status.running,
    idle: COLOR.status.idle,
  },
};

// ─── Theme Map ─────────────────────────────────────────────────

export const THEMES: Record<ThemeMode, Theme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};
