import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

export type FontFamily = 'system' | 'serif' | 'mono';
export type FontSize = 'small' | 'medium' | 'large';
export type FontWeight = 'normal' | 'medium' | 'semibold';
export type SidebarWidth = 'compact' | 'normal' | 'wide';
export type Spacing = 'compact' | 'comfortable' | 'spacious';
export type Radius = 'none' | 'small' | 'medium' | 'large';
export type ColorTheme = 'gold' | 'amber' | 'emerald' | 'blue' | 'violet' | 'rose' | 'teal' | 'neutral' | 'orange';

export interface AccentPalette {
  label: string;
  hex: string;
  light: string;
  dark: string;
  bg: string;
  border: string;
  borderHover: string;
  borderActive: string;
}

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
];

export const ACCENT_PALETTES: Record<ColorTheme, AccentPalette> = {
  gold: {
    label: 'Vestara Gold',
    hex: '#D4A843',
    light: '#DFBA5A',
    dark: '#B8933A',
    bg: 'rgba(212,168,67,0.10)',
    border: 'rgba(212,168,67,0.25)',
    borderHover: 'rgba(212,168,67,0.45)',
    borderActive: '#D4A843',
  },

  amber: {
    label: 'Amber',
    hex: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
    bg: '#f59e0b14',
    border: '#f59e0b40',
    borderHover: '#f59e0b60',
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
};

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
  root.style.setProperty('--vestara-accent-bg', theme.bg);
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
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved]);

  const applyProfile = useCallback((id: string) => {
    const profile = PROFILES.find((p) => p.id === id);
    if (!profile) return;
    setActiveProfile(id);
    setSettingsState(profile.settings);
    try {
      localStorage.setItem(PROFILE_KEY, id);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(profile.settings));
    } catch {}
  }, []);

  const updateSetting = useCallback(<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setActiveProfile('');
    setSettingsState((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        localStorage.setItem(PROFILE_KEY, '');
      } catch {}
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    applyProfile('default');
  }, [applyProfile]);

  useEffect(() => {
    applySettings(settings, resolved);
  }, [settings, resolved]);

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

export { FONT_STACKS, FONT_SIZES, FONT_WEIGHTS, SIDEBAR_WIDTHS, SPACINGS, RADII, DEFAULT_SETTINGS };
