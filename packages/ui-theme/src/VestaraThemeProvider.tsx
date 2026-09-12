/**
 * VES-DESIGN-004: VestaraThemeProvider
 *
 * Canonical theme authority for Vestara. Provides:
 * - Theme mode (dark/light/system) management
 * - Accent color palette selection
 * - CSS variable application from @vestara/ui-tokens
 * - Theme state context for child components
 *
 * Architecture:
 *   @vestara/ui-tokens (Layer 0) → VestaraThemeProvider (Layer 1) → apps
 *
 * Replaces the app-local ThemeProvider in apps/workspace/src/lib/theme.tsx.
 * Applications should consume <VestaraThemeProvider> instead of local theme logic.
 *
 * Architecture Traceability:
 *   VES-DESIGN-004: Theme Authority Integration
 *   @see docs/architecture/VES-DESIGN-002-CANONICAL-TOKEN-CONTRACT.md
 */

import {
  ACCENT_PALETTES,
  type AccentColorTheme,
  type AccentPalette,
  DARK_THEME,
  LIGHT_THEME,
  type Theme,
} from '@vestara/ui-tokens';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light' | 'system';

export interface VestaraThemeState {
  /** Resolved appearance mode (never 'system'). */
  readonly resolvedMode: 'dark' | 'light';
  /** User-selected mode (may be 'system'). */
  readonly mode: ThemeMode;
  /** Set the theme mode. */
  readonly setMode: (mode: ThemeMode) => void;
  /** Toggle between dark and light. */
  readonly toggle: () => void;
  /** Current accent color theme key. */
  readonly accentTheme: AccentColorTheme;
  /** Set the accent color theme. */
  readonly setAccentTheme: (theme: AccentColorTheme) => void;
  /** The resolved theme object for the current appearance. */
  readonly theme: Theme;
}

// ─── Constants ─────────────────────────────────────────────────

const THEME_KEY = 'vestara-theme-mode';
const ACCENT_KEY = 'vestara-accent-theme';

const STORAGE_KEYS = {
  mode: THEME_KEY,
  accent: ACCENT_KEY,
} as const;

// ─── Helpers ───────────────────────────────────────────────────

function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.mode);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'dark';
}

function getStoredAccent(): AccentColorTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.accent);
    if (v && v in ACCENT_PALETTES) return v as AccentColorTheme;
  } catch {}
  return 'amber';
}

function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

// ─── CSS Variable Application ─────────────────────────────────

/**
 * Apply accent palette CSS variables to the document root.
 * This overrides the generated fallback values from generated-tokens.css
 * with the user-selected accent color palette.
 */
function applyAccentVariables(accent: AccentPalette | undefined) {
  if (!accent) return;
  const root = document.documentElement;
  root.style.setProperty('--vestara-accent', accent.hex);
  root.style.setProperty('--vestara-accent-light', accent.light);
  root.style.setProperty('--vestara-accent-dark', accent.dark);
  // --vestara-accent-bg is intentionally NOT stamped here: apps/workspace
  // index.css derives it from the live --vestara-accent over the shell, so
  // every bg-(--vestara-accent-bg) panel tracks the selected accent theme
  // instead of freezing at the palette's translucent wash.
  root.style.setProperty('--vestara-accent-border', accent.border);
  root.style.setProperty('--vestara-accent-border-hover', accent.borderHover);
  root.style.setProperty('--vestara-accent-border-active', accent.borderActive);
  root.style.setProperty('--vestara-accent-text', accent.dark);
  root.style.setProperty('--vestara-accent-text-hover', accent.light);
  root.style.setProperty('--vestara-accent-text-muted', accent.hex);
}

/**
 * Apply appearance mode attributes to the document root.
 */
function applyModeAttributes(resolved: 'dark' | 'light') {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('light', resolved === 'light');
  root.classList.toggle('dark', resolved === 'dark');
}

// ─── Context ───────────────────────────────────────────────────

const VestaraThemeContext = createContext<VestaraThemeState | null>(null);

export function useVestaraTheme(): VestaraThemeState {
  const ctx = useContext(VestaraThemeContext);
  if (!ctx) {
    throw new Error('useVestaraTheme must be used within a VestaraThemeProvider');
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────

export interface VestaraThemeProviderProps {
  children: ReactNode;
  /** Initial theme mode (default: stored or 'dark'). */
  initialMode?: ThemeMode;
  /** Initial accent theme (default: stored or 'amber'). */
  initialAccent?: AccentColorTheme;
}

export function VestaraThemeProvider({ children, initialMode, initialAccent }: VestaraThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? getStoredMode);
  const [accentTheme, setAccentThemeState] = useState<AccentColorTheme>(initialAccent ?? getStoredAccent);

  const resolved = useMemo(() => resolveMode(mode), [mode]);
  const theme = resolved === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Apply CSS variables when mode or accent changes
  useEffect(() => {
    applyModeAttributes(resolved);
    const accent = ACCENT_PALETTES[accentTheme] as AccentPalette | undefined;
    applyAccentVariables(accent);
  }, [resolved, accentTheme]);

  // Listen for system preference changes
  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyModeAttributes(resolveMode(mode));
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEYS.mode, m);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const setAccentTheme = useCallback((t: AccentColorTheme) => {
    setAccentThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEYS.accent, t);
    } catch {}
  }, []);

  const state: VestaraThemeState = useMemo(
    () => ({
      resolvedMode: resolved,
      mode,
      setMode,
      toggle,
      accentTheme,
      setAccentTheme,
      theme,
    }),
    [resolved, mode, setMode, toggle, accentTheme, setAccentTheme, theme],
  );

  return <VestaraThemeContext.Provider value={state}>{children}</VestaraThemeContext.Provider>;
}
