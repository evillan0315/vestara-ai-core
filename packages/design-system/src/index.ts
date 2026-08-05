// Renderer-neutral semantic design tokens for Vestara.
// Shared by the Workspace UI (React/web) and the terminal TUI (OpenTUI/React).

export type ColorTheme = 'gold' | 'amber' | 'emerald' | 'blue' | 'violet' | 'rose' | 'teal' | 'neutral' | 'orange';

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

export const ACCENT_PALETTES: Record<ColorTheme, AccentPalette> = {
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
    hex: '#94a3b8',
    light: '#cbd5e1',
    dark: '#64748b',
    bg: '#94a3b814',
    border: '#94a3b840',
    borderHover: '#94a3b880',
    borderActive: '#94a3b8',
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

export const DEFAULT_THEME: ColorTheme = 'gold';

// ─── Terminal TUI semantic tokens ─────────────────────────────

export interface TuiSemanticPalette {
  readonly accent: string;
  readonly accentBright: string;
  readonly accentDim: string;
  readonly background: string;
  readonly backgroundPanel: string;
  readonly backgroundElement: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textDim: string;
  readonly border: string;
  readonly borderActive: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly info: string;
  readonly focus: string;
}

/** Base terminal palette for the default metallic-gold Vestara theme. */
export const TUI_SEMANTIC_PALETTES: Record<ColorTheme, TuiSemanticPalette> = {
  gold: {
    accent: '#D4A843',
    accentBright: '#F0C75E',
    accentDim: '#B8933A',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#D4A843',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#D4A843',
  },
  amber: {
    accent: '#f59e0b',
    accentBright: '#fbbf24',
    accentDim: '#d97706',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#f59e0b',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#f59e0b',
  },
  emerald: {
    accent: '#10b981',
    accentBright: '#34d399',
    accentDim: '#059669',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#10b981',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#10b981',
  },
  blue: {
    accent: '#3b82f6',
    accentBright: '#60a5fa',
    accentDim: '#2563eb',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#3b82f6',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#3b82f6',
  },
  violet: {
    accent: '#8b5cf6',
    accentBright: '#a78bfa',
    accentDim: '#7c3aed',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#8b5cf6',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#8b5cf6',
  },
  rose: {
    accent: '#f43f5e',
    accentBright: '#fb7185',
    accentDim: '#e11d48',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#f43f5e',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#f43f5e',
  },
  teal: {
    accent: '#14b8a6',
    accentBright: '#2dd4bf',
    accentDim: '#0d9488',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#14b8a6',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#14b8a6',
  },
  neutral: {
    accent: '#94a3b8',
    accentBright: '#cbd5e1',
    accentDim: '#64748b',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#94a3b8',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#94a3b8',
  },
  orange: {
    accent: '#f97316',
    accentBright: '#fb923c',
    accentDim: '#ea580c',
    background: '#0d0d0d',
    backgroundPanel: '#141414',
    backgroundElement: '#1c1c1c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textDim: '#78716c',
    border: '#3f3f3f',
    borderActive: '#f97316',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
    focus: '#f97316',
  },
};

// ─── Entity / status presentation metadata (renderer-neutral) ──

export type EntityKind = 'agent' | 'task' | 'workflow' | 'session' | 'plan' | 'file' | 'approval' | 'verification';

export type StatusTone = 'idle' | 'active' | 'success' | 'warning' | 'error' | 'info';

export const STATUS_TONES: Record<string, StatusTone> = {
  active: 'active',
  running: 'active',
  executing: 'active',
  thinking: 'active',
  queued: 'idle',
  created: 'idle',
  pending: 'idle',
  completed: 'success',
  verified: 'success',
  approved: 'success',
  healthy: 'success',
  degraded: 'warning',
  blocked: 'warning',
  awaiting: 'warning',
  failed: 'error',
  error: 'error',
  cancelled: 'error',
  denied: 'error',
  unhealthy: 'error',
  connecting: 'info',
  syncing: 'info',
  initializing: 'info',
};

export function toneForStatus(status: string | undefined): StatusTone {
  if (!status) return 'idle';
  return STATUS_TONES[status.toLowerCase()] ?? 'idle';
}

export interface EntityPresentation {
  readonly kind: EntityKind;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

export const ENTITY_PRESENTATION: Record<EntityKind, EntityPresentation> = {
  agent: { kind: 'agent', label: 'Agent', icon: '◈', color: '#D4A843' },
  task: { kind: 'task', label: 'Task', icon: '▸', color: '#60a5fa' },
  workflow: { kind: 'workflow', label: 'Workflow', icon: '↻', color: '#a78bfa' },
  session: { kind: 'session', label: 'Session', icon: '◎', color: '#34d399' },
  plan: { kind: 'plan', label: 'Plan', icon: '▦', color: '#fbbf24' },
  file: { kind: 'file', label: 'File', icon: '▪', color: '#94a3b8' },
  approval: { kind: 'approval', label: 'Approval', icon: '⚠', color: '#fb7185' },
  verification: { kind: 'verification', label: 'Verification', icon: '✓', color: '#34d399' },
};

export function presentationFor(kind: string): EntityPresentation {
  return (
    ENTITY_PRESENTATION[kind as EntityKind] ?? {
      kind: 'task',
      label: kind,
      icon: '▸',
      color: '#94a3b8',
    }
  );
}

// ─── Navigation definitions (renderer-neutral) ────────────────

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly key: string;
}

export const TUI_NAVIGATION: readonly NavItem[] = [
  { id: 'chat', label: 'Chat', icon: '💬', key: '1' },
  { id: 'sessions', label: 'Sessions', icon: '◎', key: '2' },
  { id: 'plans', label: 'Plans', icon: '▦', key: '3' },
  { id: 'graph', label: 'Graph', icon: '◈', key: '4' },
  { id: 'execution', label: 'Execution', icon: '▸', key: '5' },
  { id: 'workflow', label: 'Workflow', icon: '↻', key: '6' },
  { id: 'logs', label: 'Logs', icon: '≡', key: '7' },
  { id: 'artifacts', label: 'Artifacts', icon: '▪', key: '8' },
  { id: 'settings', label: 'Settings', icon: '⚙', key: '9' },
];

export const TUI_NAV_KEYS: readonly string[] = TUI_NAVIGATION.map((item) => item.id);
