import { ACCENT_PALETTES, type AccentColorTheme } from '@vestara/ui-tokens';
export { ACCENT_PALETTES } from '@vestara/ui-tokens';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { persistAppearanceSettings, persistThemeMode, resolveHydratedTheme } from './appearance-durability';

export type ThemeMode = 'dark' | 'light' | 'system';

export type FontFamily = 'system' | 'serif' | 'mono';
export type FontSize = 'small' | 'medium' | 'large';
export type FontWeight = 'normal' | 'medium' | 'semibold';
export type SidebarWidth = 'compact' | 'normal' | 'wide';
export type Spacing = 'compact' | 'comfortable' | 'spacious';
export type Radius = 'none' | 'small' | 'medium' | 'large';
export type ColorTheme = AccentColorTheme;

// Re-export AccentPalette from @vestara/ui-tokens (VES-DESIGN-004)
export type { AccentPalette } from '@vestara/ui-tokens';

export interface ThemeSettings {
  fontFamily: FontFamily;
  fontSize: FontSize;
  fontWeight: FontWeight;
  sidebarWidth: SidebarWidth;
  spacing: Spacing;
  radius: Radius;
  fullWidth: boolean;
  fullScreen: boolean;
  sidebarEnabled: boolean;
  sidebarMode: 'icons' | 'text';
  leftBorderEnabled: boolean;
  leftBorderColor: string;
  leftBorderThickness: number;
  colorTheme: ColorTheme;
}

export interface ProfileSettings extends ThemeSettings {
  leftBorderEnabled: boolean;
  leftBorderColor: string;
  leftBorderThickness: number;
}

export interface WorkspaceProfile {
  id: string;
  label: string;
  description: string;
  icon: string;
  settings: ThemeSettings;
  /** Optional theme mode applied with the profile (profiles without a mode keep the current mode). */
  mode?: ThemeMode;
}

export const PROFILES: WorkspaceProfile[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced dark theme',
    icon: '◈',
    settings: {
      fontFamily: 'system',
      fontSize: 'medium',
      fontWeight: 'normal',
      sidebarWidth: 'normal',
      spacing: 'comfortable',
      radius: 'medium',
      fullWidth: true,
      fullScreen: false,
      sidebarEnabled: true,
      sidebarMode: 'text',
      colorTheme: 'gold',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Mono font · sharp corners · compact spacing',
    icon: '⊟',
    settings: {
      fontFamily: 'mono',
      fontSize: 'small',
      fontWeight: 'normal',
      sidebarWidth: 'compact',
      spacing: 'compact',
      radius: 'none',
      fullWidth: false,
      fullScreen: false,
      sidebarEnabled: true,
      sidebarMode: 'icons',
      colorTheme: 'neutral',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
  {
    id: 'presentation',
    label: 'Presentation',
    description: 'Large font · wide sidebar · comfortable spacing',
    icon: '▯',
    settings: {
      fontFamily: 'system',
      fontSize: 'large',
      fontWeight: 'normal',
      sidebarWidth: 'wide',
      spacing: 'comfortable',
      radius: 'large',
      fullWidth: true,
      colorTheme: 'blue',
      fullScreen: false,
      sidebarEnabled: false,
      sidebarMode: 'icons',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    description: 'Large text · high contrast · wide spacing',
    icon: '♿',
    settings: {
      fontFamily: 'system',
      fontSize: 'large',
      fontWeight: 'semibold',
      sidebarWidth: 'wide',
      spacing: 'spacious',
      radius: 'large',
      fullWidth: true,
      colorTheme: 'violet',
      fullScreen: false,
      sidebarEnabled: false,
      sidebarMode: 'icons',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
  {
    id: 'premium',
    label: 'Premium',
    description: 'Gallery glow · light mode · wide rail · large radius',
    icon: '✦',
    mode: 'light',
    settings: {
      fontFamily: 'system',
      fontSize: 'medium',
      fontWeight: 'normal',
      sidebarWidth: 'wide',
      spacing: 'comfortable',
      radius: 'large',
      fullWidth: true,
      colorTheme: 'gold',
      fullScreen: false,
      sidebarEnabled: true,
      sidebarMode: 'text',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
  {
    id: 'premium-dark',
    label: 'Premium Dark',
    description: 'Gallery glow · dark mode · wide rail · large radius',
    icon: '✧',
    mode: 'dark',
    settings: {
      fontFamily: 'system',
      fontSize: 'medium',
      fontWeight: 'normal',
      sidebarWidth: 'wide',
      spacing: 'comfortable',
      radius: 'large',
      fullWidth: true,
      colorTheme: 'amber',
      fullScreen: false,
      sidebarEnabled: true,
      sidebarMode: 'text',
      leftBorderEnabled: false,
      leftBorderColor: '',
      leftBorderThickness: 0,
    },
  },
];

interface ThemeState {
  mode: ThemeMode;
  resolved: 'dark' | 'light';
  settings: ThemeSettings;
  activeProfile: string;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  applyProfile: (id: string) => void;
  resetSettings: () => void;
  updateSetting: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
}

const THEME_KEY = 'vestara-theme';
const SETTINGS_KEY = 'vestara-theme-settings';
const PROFILE_KEY = 'vestara-theme-profile';

const DEFAULT_SETTINGS: ThemeSettings = {
  fontFamily: 'system',
  fontSize: 'medium',
  fontWeight: 'normal',
  sidebarWidth: 'normal',
  spacing: 'comfortable',
  radius: 'medium',
  fullWidth: true,
  fullScreen: false,
  sidebarEnabled: true,
  sidebarMode: 'text',
  leftBorderEnabled: true,
  leftBorderColor: '#f59e0b',
  leftBorderThickness: 4,
  colorTheme: 'gold',
};

const FONT_STACKS: Record<FontFamily, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  serif: 'ui-serif, "Times New Roman", Georgia, serif',
  mono: 'ui-monospace, "JetBrains Mono", "Fira Code", monospace',
};

const FONT_SIZES: Record<FontSize, { base: string; sm: string; xs: string; lg: string }> = {
  small: { base: '13.25px', sm: '11.25px', xs: '10.25px', lg: '15.25px' },
  medium: { base: '14.25px', sm: '12.25px', xs: '10.75px', lg: '16.25px' },
  large: { base: '15.25px', sm: '13.25px', xs: '11.25px', lg: '17.25px' },
};

const FONT_WEIGHTS: Record<FontWeight, { normal: string; medium: string; semibold: string }> = {
  normal: { normal: '400', medium: '500', semibold: '600' },
  medium: { normal: '450', medium: '550', semibold: '650' },
  semibold: { normal: '500', medium: '600', semibold: '700' },
};

const SIDEBAR_WIDTHS: Record<SidebarWidth, string> = {
  compact: '200px',
  normal: '240px',
  wide: '280px',
};

const SPACINGS: Record<Spacing, { page: string; section: string; element: string }> = {
  compact: { page: '0.75rem', section: '0.5rem', element: '0.25rem' },
  comfortable: { page: '1rem', section: '0.75rem', element: '0.375rem' },
  spacious: { page: '1.5rem', section: '1rem', element: '0.5rem' },
};

const RADII: Record<Radius, { default: string; lg: string; full: string }> = {
  none: { default: '0px', lg: '0px', full: '0px' },
  small: { default: '4px', lg: '6px', full: '9999px' },
  medium: { default: '6px', lg: '8px', full: '9999px' },
  large: { default: '8px', lg: '12px', full: '9999px' },
};

function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'dark';
}

function getStoredSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function getStoredProfile(): string {
  try {
    return localStorage.getItem(PROFILE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

function applySettings(settings: ThemeSettings, resolved: 'dark' | 'light') {
  const root = document.documentElement;
  root.style.setProperty('--vestara-font-family', FONT_STACKS[settings.fontFamily]);
  const sizes = FONT_SIZES[settings.fontSize];
  root.style.setProperty('--vestara-font-size-base', sizes.base);
  root.style.setProperty('--vestara-font-size-sm', sizes.sm);
  root.style.setProperty('--vestara-font-size-xs', sizes.xs);
  root.style.setProperty('--vestara-font-size-lg', sizes.lg);
  const weights = FONT_WEIGHTS[settings.fontWeight];
  root.style.setProperty('--vestara-font-weight-normal', weights.normal);
  root.style.setProperty('--vestara-font-weight-medium', weights.medium);
  root.style.setProperty('--vestara-font-weight-semibold', weights.semibold);
  root.style.setProperty('--vestara-sidebar-width', SIDEBAR_WIDTHS[settings.sidebarWidth]);
  const space = SPACINGS[settings.spacing];
  root.style.setProperty('--vestara-spacing-page', space.page);
  root.style.setProperty('--vestara-spacing-section', space.section);
  root.style.setProperty('--vestara-spacing-element', space.element);
  const radii = RADII[settings.radius];
  root.style.setProperty('--vestara-radius', radii.default);
  root.style.setProperty('--vestara-radius-lg', radii.lg);
  root.style.setProperty('--vestara-radius-full', radii.full);
  root.style.setProperty('--vestara-page-max-width', settings.fullWidth ? '100%' : '1280px');

  const theme = ACCENT_PALETTES[settings.colorTheme];

  root.style.setProperty('--vestara-accent', theme.hex);
  root.style.setProperty('--vestara-accent-light', theme.light);
  root.style.setProperty('--vestara-accent-dark', theme.dark);
  root.style.setProperty('--vestara-accent-glow', theme.glow);
  // --vestara-accent-bg is intentionally NOT overridden here: index.css
  // derives it (accent over shell) so panels stay deep dashboard-style
  // in both modes. It still follows accent selection via --vestara-accent.
  root.style.setProperty('--vestara-accent-border', theme.border);
  root.style.setProperty('--vestara-accent-border-hover', theme.borderHover);
  root.style.setProperty('--vestara-accent-border-active', theme.borderActive);

  // Useful aliases
  root.style.setProperty('--vestara-primary', theme.hex);
  root.style.setProperty('--vestara-primary-hover', theme.light);
  root.style.setProperty('--vestara-primary-muted', theme.dark);

  root.style.setProperty('--vestara-accent-text', theme.dark);
  root.style.setProperty('--vestara-accent-text-hover', theme.light);
  root.style.setProperty('--vestara-accent-text-muted', theme.hex);
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('light', resolved === 'light');
  root.classList.toggle('dark', resolved === 'dark');
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [settings, setSettingsState] = useState<ThemeSettings>(getStoredSettings);
  const [activeProfile, setActiveProfile] = useState<string>(getStoredProfile);

  const resolved = useMemo(() => resolveMode(mode), [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(THEME_KEY, m);
    } catch {}
    // Durable: persist the approved mode to workspace settings (general.theme).
    void persistThemeMode(m).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const applyProfile = useCallback((id: string) => {
    const profile = PROFILES.find((p) => p.id === id);
    if (!profile) return;
    setActiveProfile(id);
    setSettingsState(profile.settings);
    if (profile.mode) {
      setModeState(profile.mode);
      try {
        localStorage.setItem(THEME_KEY, profile.mode);
      } catch {}
      // Durable: persist the profile's theme mode alongside its appearance.
      void persistThemeMode(profile.mode).catch(() => {});
    }
    try {
      localStorage.setItem(PROFILE_KEY, id);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(profile.settings));
    } catch {}
    // Durable: persist the approved appearance to workspace settings.
    void persistAppearanceSettings(profile.settings).catch(() => {});
  }, []);

  const updateSetting = useCallback(<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setActiveProfile('');
    setSettingsState((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        localStorage.setItem(PROFILE_KEY, '');
      } catch {}
      // Durable: persist the approved appearance to workspace settings.
      void persistAppearanceSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    applyProfile('default');
  }, [applyProfile]);

  useEffect(() => {
    applySettings(settings, resolved);
  }, [settings, resolved]);

  // Reconstruct the approved appearance from durable server settings on mount,
  // so a reload restores it even when ephemeral client storage is absent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok || cancelled) return;
        const configuration = (await res.json()) as import('@vestara/configuration').ResolvedConfiguration;
        if (cancelled) return;
        const hydrated = resolveHydratedTheme(configuration);
        if (hydrated.mode) {
          setModeState(hydrated.mode);
          try {
            localStorage.setItem(THEME_KEY, hydrated.mode);
          } catch {}
        }
        if (hydrated.settings) {
          setSettingsState((prev) => ({ ...prev, ...hydrated.settings }));
          try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...hydrated.settings }));
          } catch {}
        }
      } catch {
        // API unavailable — keep the client (localStorage) values
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      applySettings(settings, mq.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, settings]);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      resolved,
      settings,
      activeProfile,
      setMode,
      toggle,
      applyProfile,
      resetSettings,
      updateSetting,
    }),
    [mode, resolved, settings, activeProfile, setMode, toggle, applyProfile, resetSettings, updateSetting],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme requires ThemeProvider');
  return ctx;
}

export function useChartColors() {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  return {
    grid: isLight ? '#d4d4c8' : '#27272a',
    text: isLight ? '#6b6b60' : '#a1a1aa',
    tooltipBg: isLight ? '#ffffff' : '#18181b',
    tooltipBorder: isLight ? '#d4d4c8' : '#27272a',
    tooltipText: isLight ? '#3a3a34' : '#d4d4d8',
    axis: isLight ? '#c0c0b8' : '#3f3f46',
  };
}

export { applySettings, DEFAULT_SETTINGS, FONT_SIZES, FONT_STACKS, FONT_WEIGHTS, RADII, SIDEBAR_WIDTHS, SPACINGS };
