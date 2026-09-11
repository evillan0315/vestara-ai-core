/**
 * VES-UI-003: Theme Tokens (Dark/Light Mode)
 *
 * Defines semantic color mappings for dark and light themes.
 * Maps abstract surface/text/border tokens to concrete color values.
 *
 * VES-DESIGN-002: Canonical amber identity. All accent values derive
 * from COLOR.brand.amber (#f59e0b) — the existing runtime identity.
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   VES-DESIGN-002: Canonical Token Contract
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *   @see docs/architecture/VES-DESIGN-002-CANONICAL-TOKEN-CONTRACT.md
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
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  error: string;
  errorBg: string;
  errorBorder: string;
  info: string;
  infoBg: string;
  infoBorder: string;
  running: string;
  pending: string;
  disabled: string;
  // GA-STATE-001: runtime session status
  active: string;
  idle: string;
  unknown: string;
  // VES-UI-003: tool/files semantic tokens (cyan)
  tool: string;
  toolBg: string;
  toolBorder: string;
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
  surface: COLOR.surface,
  text: COLOR.text,
  border: COLOR.border,
  accent: {
    primary: COLOR.brand.amber,
    secondary: COLOR.brand.amberLight,
    bg: COLOR.status.warningBg,
    border: COLOR.status.warningBorder,
    borderHover: `${COLOR.brand.amber}60`,
    borderActive: COLOR.brand.amber,
    text: COLOR.brand.amberLight,
    textHover: COLOR.brand.amberLight,
    textMuted: `${COLOR.brand.amber}99`,
  },
  status: {
    success: COLOR.status.success,
    successBg: COLOR.status.successBg,
    successBorder: COLOR.status.successBorder,
    warning: COLOR.status.warning,
    warningBg: COLOR.status.warningBg,
    warningBorder: COLOR.status.warningBorder,
    error: COLOR.status.error,
    errorBg: COLOR.status.errorBg,
    errorBorder: COLOR.status.errorBorder,
    info: COLOR.status.info,
    infoBg: COLOR.status.infoBg,
    infoBorder: COLOR.status.infoBorder,
    running: COLOR.status.running,
    pending: COLOR.status.pending,
    disabled: COLOR.status.disabled,
    active: COLOR.status.active,
    idle: COLOR.status.idle,
    unknown: COLOR.status.unknown,
    tool: COLOR.status.tool,
    toolBg: COLOR.status.toolBg,
    toolBorder: COLOR.status.toolBorder,
  },
};

// ─── Light Theme ───────────────────────────────────────────────

export const LIGHT_THEME: Theme = {
  mode: 'light',
  surface: {
    canvas: COLOR.zinc[50],
    shell: '#ffffff',
    panel: '#ffffff',
    panelRaised: COLOR.zinc[50],
    overlay: 'rgba(0, 0, 0, 0.5)',
    interactive: COLOR.zinc[100],
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
    focus: COLOR.brand.amber,
  },
  accent: {
    primary: '#b45309', // Light mode: darker amber for contrast on light backgrounds
    secondary: COLOR.brand.amberDark,
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.2)',
    borderHover: 'rgba(245, 158, 11, 0.3)',
    borderActive: COLOR.brand.amber,
    text: COLOR.brand.amberDark,
    textHover: COLOR.brand.amber,
    textMuted: 'rgba(245, 158, 11, 0.5)',
  },
  status: {
    success: '#16a34a',
    successBg: 'rgba(22, 163, 74, 0.08)',
    successBorder: 'rgba(22, 163, 74, 0.2)',
    warning: '#b45309',
    warningBg: 'rgba(180, 83, 9, 0.08)',
    warningBorder: 'rgba(180, 83, 9, 0.2)',
    error: '#dc2626',
    errorBg: 'rgba(220, 38, 38, 0.08)',
    errorBorder: 'rgba(220, 38, 38, 0.2)',
    info: '#2563eb',
    infoBg: 'rgba(37, 99, 235, 0.08)',
    infoBorder: 'rgba(37, 99, 235, 0.2)',
    running: '#16a34a',
    pending: '#b45309',
    disabled: COLOR.zinc[400],
    active: '#16a34a', // busy/working — same as success
    idle: COLOR.zinc[500], // idle — neutral muted
    unknown: COLOR.zinc[400], // unknown — same as disabled
    tool: '#0891b2', // Light mode: darker cyan for contrast
    toolBg: 'rgba(8, 145, 178, 0.08)',
    toolBorder: 'rgba(8, 145, 178, 0.2)',
  },
};

// ─── Theme Map ─────────────────────────────────────────────────

export const THEMES: Record<ThemeMode, Theme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};
