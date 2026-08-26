import type { TuiSemanticPalette } from '@vestara/design-system';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { persistAppearanceSettings, persistThemeMode, resolveHydratedTheme } from './appearance-durability';

export type ThemeMode = 'dark' | 'light' | 'system';

export type FontFamily = 'system' | 'serif' | 'mono';
export type FontSize = 'small' | 'medium' | 'large';
export type FontWeight = 'normal' | 'medium' | 'semibold';
export type SidebarWidth = 'compact' | 'normal' | 'wide';
export type Spacing = 'compact' | 'comfortable' | 'spacious';
export type Radius = 'none' | 'small' | 'medium' | 'large';
export type ColorTheme = 'gold' | 'amber' | 'emerald' | 'blue' | 'violet' | 'rose' | 'teal' | 'neutral' | 'orange';

// ─── Theme Builder Types ──────────────────────────────────────────

export type TokenCategory =
  | 'color-bg'
  | 'color-surface'
  | 'color-border'
  | 'color-text'
  | 'color-focus'
  | 'color-status'
  | 'color-accent'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'motion'
  | 'typography';

export interface SemanticToken {
  name: string;
  category: TokenCategory;
  cssVar: string;
  label: string;
  description: string;
  type: 'color' | 'length' | 'number' | 'font-stack';
  defaultValue: string;
  currentValue: string;
  lightValue?: string;
  darkValue?: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean;
  baseThemeId: string;
  tokens: Record<string, string>;
  lightTokens?: Record<string, string>;
  darkTokens?: Record<string, string>;
  profile: Partial<ThemeSettings>;
  tuiPalette?: Partial<TuiSemanticPalette>;
}

export interface ThemeBuilderState {
  editingTheme: CustomTheme | null;
  previewMode: boolean;
  customThemes: CustomTheme[];
  builtInThemes: CustomTheme[];
}

// ─── Semantic Token Catalog ────────────────────────────────────────

export const SEMANTIC_TOKENS: readonly SemanticToken[] = [
  // ── Color: Background ──
  {
    name: 'color-bg-app',
    category: 'color-bg',
    cssVar: '--color-zinc-950',
    label: 'App Background',
    description: 'Main application background color',
    type: 'color',
    defaultValue: '#09090b',
    currentValue: '#09090b',
    lightValue: '#fafaf5',
    darkValue: '#09090b',
  },
  {
    name: 'color-bg-elevated',
    category: 'color-bg',
    cssVar: '--color-zinc-900',
    label: 'Elevated Background',
    description: 'Background for elevated surfaces (cards, panels)',
    type: 'color',
    defaultValue: '#18181b',
    currentValue: '#18181b',
    lightValue: '#f0f0ea',
    darkValue: '#18181b',
  },
  {
    name: 'color-bg-hover',
    category: 'color-bg',
    cssVar: '--color-zinc-800',
    label: 'Hover Background',
    description: 'Background color for hover states',
    type: 'color',
    defaultValue: '#27272a',
    currentValue: '#27272a',
    lightValue: '#e0e0d8',
    darkValue: '#27272a',
  },
  {
    name: 'color-bg-active',
    category: 'color-bg',
    cssVar: '--color-zinc-700',
    label: 'Active Background',
    description: 'Background color for active/pressed states',
    type: 'color',
    defaultValue: '#3f3f46',
    currentValue: '#3f3f46',
    lightValue: '#c8c8c0',
    darkValue: '#3f3f46',
  },

  // ── Color: Surface ──
  {
    name: 'color-surface-panel',
    category: 'color-surface',
    cssVar: '--color-zinc-900',
    label: 'Panel Surface',
    description: 'Primary panel/card surface color',
    type: 'color',
    defaultValue: '#18181b',
    currentValue: '#18181b',
    lightValue: '#f0f0ea',
    darkValue: '#18181b',
  },
  {
    name: 'color-surface-raised',
    category: 'color-surface',
    cssVar: '--color-zinc-800',
    label: 'Raised Surface',
    description: 'Elevated surface for dropdowns, modals, tooltips',
    type: 'color',
    defaultValue: '#27272a',
    currentValue: '#27272a',
    lightValue: '#e0e0d8',
    darkValue: '#27272a',
  },
  {
    name: 'color-surface-interactive',
    category: 'color-surface',
    cssVar: '--color-zinc-700',
    label: 'Interactive Surface',
    description: 'Surface for interactive elements (buttons, inputs)',
    type: 'color',
    defaultValue: '#3f3f46',
    currentValue: '#3f3f46',
    lightValue: '#c8c8c0',
    darkValue: '#3f3f46',
  },
  {
    name: 'color-surface-interactive-hover',
    category: 'color-surface',
    cssVar: '--color-zinc-600',
    label: 'Interactive Surface Hover',
    description: 'Surface for interactive elements on hover',
    type: 'color',
    defaultValue: '#52525b',
    currentValue: '#52525b',
    lightValue: '#a8a8a0',
    darkValue: '#52525b',
  },

  // ── Color: Border ──
  {
    name: 'color-border-subtle',
    category: 'color-border',
    cssVar: '--color-zinc-800',
    label: 'Subtle Border',
    description: 'Subtle border for dividers and hairlines',
    type: 'color',
    defaultValue: '#27272a',
    currentValue: '#27272a',
    lightValue: '#e0e0d8',
    darkValue: '#27272a',
  },
  {
    name: 'color-border-default',
    category: 'color-border',
    cssVar: '--color-zinc-700',
    label: 'Default Border',
    description: 'Standard border color for cards and containers',
    type: 'color',
    defaultValue: '#3f3f46',
    currentValue: '#3f3f46',
    lightValue: '#c8c8c0',
    darkValue: '#3f3f46',
  },
  {
    name: 'color-border-strong',
    category: 'color-border',
    cssVar: '--color-zinc-600',
    label: 'Strong Border',
    description: 'Prominent border for focus and active states',
    type: 'color',
    defaultValue: '#52525b',
    currentValue: '#52525b',
    lightValue: '#a8a8a0',
    darkValue: '#52525b',
  },
  {
    name: 'color-border-accent',
    category: 'color-border',
    cssVar: '--vestara-accent-border',
    label: 'Accent Border',
    description: 'Border using the accent color',
    type: 'color',
    defaultValue: '#f59e0b40',
    currentValue: '#f59e0b40',
    lightValue: '#b4530940',
    darkValue: '#f59e0b40',
  },
  {
    name: 'color-border-accent-hover',
    category: 'color-border',
    cssVar: '--vestara-accent-border-hover',
    label: 'Accent Border Hover',
    description: 'Accent border on hover',
    type: 'color',
    defaultValue: '#f59e0b60',
    currentValue: '#f59e0b60',
    lightValue: '#b4530960',
    darkValue: '#f59e0b60',
  },
  {
    name: 'color-border-accent-active',
    category: 'color-border',
    cssVar: '--vestara-accent-border-active',
    label: 'Accent Border Active',
    description: 'Accent border in active state',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },

  // ── Color: Text ──
  {
    name: 'color-text-primary',
    category: 'color-text',
    cssVar: '--vestara-text',
    label: 'Primary Text',
    description: 'Main text color for headings and body',
    type: 'color',
    defaultValue: '#e4e4e7',
    currentValue: '#e4e4e7',
    lightValue: '#3a3a34',
    darkValue: '#e4e4e7',
  },
  {
    name: 'color-text-secondary',
    category: 'color-text',
    cssVar: '--vestara-text-2',
    label: 'Secondary Text',
    description: 'Secondary text for descriptions and labels',
    type: 'color',
    defaultValue: '#a1a1aa',
    currentValue: '#a1a1aa',
    lightValue: '#6b6b60',
    darkValue: '#a1a1aa',
  },
  {
    name: 'color-text-muted',
    category: 'color-text',
    cssVar: '--vestara-text-muted',
    label: 'Muted Text',
    description: 'Muted text for placeholders and disabled states',
    type: 'color',
    defaultValue: '#71717a',
    currentValue: '#71717a',
    lightValue: '#888880',
    darkValue: '#71717a',
  },
  {
    name: 'color-text-dim',
    category: 'color-text',
    cssVar: '--vestara-text-dim',
    label: 'Dim Text',
    description: 'Very dim text for subtle annotations',
    type: 'color',
    defaultValue: '#52525b',
    currentValue: '#52525b',
    lightValue: '#a8a8a0',
    darkValue: '#52525b',
  },

  // ── Color: Focus ──
  {
    name: 'color-focus-ring',
    category: 'color-focus',
    cssVar: '--vestara-accent',
    label: 'Focus Ring',
    description: 'Focus indicator color for keyboard navigation',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },

  // ── Color: Status ──
  {
    name: 'color-status-success',
    category: 'color-status',
    cssVar: '--vestara-green',
    label: 'Success',
    description: 'Green for success/healthy states',
    type: 'color',
    defaultValue: '#4ade80',
    currentValue: '#4ade80',
    lightValue: '#16a34a',
    darkValue: '#4ade80',
  },
  {
    name: 'color-status-warning',
    category: 'color-status',
    cssVar: '--vestara-amber',
    label: 'Warning',
    description: 'Amber for warning/degraded states',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },
  {
    name: 'color-status-error',
    category: 'color-status',
    cssVar: '--vestara-red',
    label: 'Error',
    description: 'Red for error/failed states',
    type: 'color',
    defaultValue: '#f87171',
    currentValue: '#f87171',
    lightValue: '#dc2626',
    darkValue: '#f87171',
  },
  {
    name: 'color-status-info',
    category: 'color-status',
    cssVar: '--vestara-blue',
    label: 'Info',
    description: 'Blue for informational states',
    type: 'color',
    defaultValue: '#60a5fa',
    currentValue: '#60a5fa',
    lightValue: '#2563eb',
    darkValue: '#60a5fa',
  },
  {
    name: 'color-status-unavailable',
    category: 'color-status',
    cssVar: '--color-zinc-600',
    label: 'Unavailable',
    description: 'Gray for unavailable/offline states',
    type: 'color',
    defaultValue: '#52525b',
    currentValue: '#52525b',
    lightValue: '#a8a8a0',
    darkValue: '#52525b',
  },
  {
    name: 'color-status-disabled',
    category: 'color-status',
    cssVar: '--color-zinc-700',
    label: 'Disabled',
    description: 'Color for disabled elements',
    type: 'color',
    defaultValue: '#3f3f46',
    currentValue: '#3f3f46',
    lightValue: '#c8c8c0',
    darkValue: '#3f3f46',
  },
  {
    name: 'color-status-auth',
    category: 'color-status',
    cssVar: '--vestara-purple',
    label: 'Authentication',
    description: 'Purple for auth-related states',
    type: 'color',
    defaultValue: '#a78bfa',
    currentValue: '#a78bfa',
    lightValue: '#7c3aed',
    darkValue: '#a78bfa',
  },
  {
    name: 'color-status-approval',
    category: 'color-status',
    cssVar: '#fb7185',
    label: 'Approval',
    description: 'Rose for approval-required states',
    type: 'color',
    defaultValue: '#fb7185',
    currentValue: '#fb7185',
    lightValue: '#e11d48',
    darkValue: '#fb7185',
  },
  {
    name: 'color-status-conflict',
    category: 'color-status',
    cssVar: '#fbbf24',
    label: 'Conflict',
    description: 'Amber for conflict states',
    type: 'color',
    defaultValue: '#fbbf24',
    currentValue: '#fbbf24',
    lightValue: '#d97706',
    darkValue: '#fbbf24',
  },
  {
    name: 'color-status-saving',
    category: 'color-status',
    cssVar: '#60a5fa',
    label: 'Saving',
    description: 'Blue for saving/in-progress states',
    type: 'color',
    defaultValue: '#60a5fa',
    currentValue: '#60a5fa',
    lightValue: '#2563eb',
    darkValue: '#60a5fa',
  },
  {
    name: 'color-status-saved',
    category: 'color-status',
    cssVar: '#4ade80',
    label: 'Saved',
    description: 'Green for saved/committed states',
    type: 'color',
    defaultValue: '#4ade80',
    currentValue: '#4ade80',
    lightValue: '#16a34a',
    darkValue: '#4ade80',
  },
  {
    name: 'color-status-failed',
    category: 'color-status',
    cssVar: '#f87171',
    label: 'Failed',
    description: 'Red for failed states',
    type: 'color',
    defaultValue: '#f87171',
    currentValue: '#f87171',
    lightValue: '#dc2626',
    darkValue: '#f87171',
  },
  {
    name: 'color-status-blocked',
    category: 'color-status',
    cssVar: '#f59e0b',
    label: 'Blocked',
    description: 'Amber for blocked states',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },
  {
    name: 'color-status-pending',
    category: 'color-status',
    cssVar: '#a78bfa',
    label: 'Pending',
    description: 'Violet for pending states',
    type: 'color',
    defaultValue: '#a78bfa',
    currentValue: '#a78bfa',
    lightValue: '#7c3aed',
    darkValue: '#a78bfa',
  },

  // ── Color: Accent ──
  {
    name: 'color-accent-primary',
    category: 'color-accent',
    cssVar: '--vestara-accent',
    label: 'Accent Primary',
    description: 'Primary accent color',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },
  {
    name: 'color-accent-light',
    category: 'color-accent',
    cssVar: '--vestara-accent-light',
    label: 'Accent Light',
    description: 'Lighter variant of accent for hover states',
    type: 'color',
    defaultValue: '#fbbf24',
    currentValue: '#fbbf24',
    lightValue: '#d97706',
    darkValue: '#fbbf24',
  },
  {
    name: 'color-accent-dark',
    category: 'color-accent',
    cssVar: '--vestara-accent-dark',
    label: 'Accent Dark',
    description: 'Darker variant of accent for active states',
    type: 'color',
    defaultValue: '#d97706',
    currentValue: '#d97706',
    lightValue: '#92400e',
    darkValue: '#d97706',
  },
  {
    name: 'color-accent-bg',
    category: 'color-accent',
    cssVar: '--vestara-accent-bg',
    label: 'Accent Background',
    description: 'Semi-transparent accent background',
    type: 'color',
    defaultValue: '#f59e0b14',
    currentValue: '#f59e0b14',
    lightValue: '#b4530914',
    darkValue: '#f59e0b14',
  },
  {
    name: 'color-accent-text',
    category: 'color-accent',
    cssVar: '--vestara-accent-text',
    label: 'Accent Text',
    description: 'Text color using accent',
    type: 'color',
    defaultValue: '#fbbf24',
    currentValue: '#fbbf24',
    lightValue: '#d97706',
    darkValue: '#fbbf24',
  },
  {
    name: 'color-accent-text-hover',
    category: 'color-accent',
    cssVar: '--vestara-accent-text-hover',
    label: 'Accent Text Hover',
    description: 'Accent text on hover',
    type: 'color',
    defaultValue: '#fbbf24',
    currentValue: '#fbbf24',
    lightValue: '#d97706',
    darkValue: '#fbbf24',
  },
  {
    name: 'color-accent-text-muted',
    category: 'color-accent',
    cssVar: '--vestara-accent-text-muted',
    label: 'Accent Text Muted',
    description: 'Muted accent text',
    type: 'color',
    defaultValue: '#f59e0b',
    currentValue: '#f59e0b',
    lightValue: '#b45309',
    darkValue: '#f59e0b',
  },

  // ── Spacing ──
  {
    name: 'spacing-page',
    category: 'spacing',
    cssVar: '--vestara-spacing-page',
    label: 'Page Spacing',
    description: 'Page-level padding/margin',
    type: 'length',
    defaultValue: '1rem',
    currentValue: '1rem',
  },
  {
    name: 'spacing-section',
    category: 'spacing',
    cssVar: '--vestara-spacing-section',
    label: 'Section Spacing',
    description: 'Section-level spacing',
    type: 'length',
    defaultValue: '0.75rem',
    currentValue: '0.75rem',
  },
  {
    name: 'spacing-element',
    category: 'spacing',
    cssVar: '--vestara-spacing-element',
    label: 'Element Spacing',
    description: 'Element-level spacing (gaps, small margins)',
    type: 'length',
    defaultValue: '0.375rem',
    currentValue: '0.375rem',
  },

  // ── Radius ──
  {
    name: 'radius-default',
    category: 'radius',
    cssVar: '--vestara-radius',
    label: 'Default Radius',
    description: 'Default border radius for components',
    type: 'length',
    defaultValue: '6px',
    currentValue: '6px',
  },
  {
    name: 'radius-lg',
    category: 'radius',
    cssVar: '--vestara-radius-lg',
    label: 'Large Radius',
    description: 'Large border radius for cards and modals',
    type: 'length',
    defaultValue: '8px',
    currentValue: '8px',
  },
  {
    name: 'radius-full',
    category: 'radius',
    cssVar: '--vestara-radius-full',
    label: 'Full Radius',
    description: 'Fully rounded (pill) radius',
    type: 'length',
    defaultValue: '9999px',
    currentValue: '9999px',
  },

  // ── Shadow ──
  {
    name: 'shadow-sm',
    category: 'shadow',
    cssVar: '--vestara-shadow-sm',
    label: 'Small Shadow',
    description: 'Subtle shadow for cards',
    type: 'color',
    defaultValue: '0 1px 2px rgba(0,0,0,0.05)',
    currentValue: '0 1px 2px rgba(0,0,0,0.05)',
  },
  {
    name: 'shadow-md',
    category: 'shadow',
    cssVar: '--vestara-shadow-md',
    label: 'Medium Shadow',
    description: 'Medium shadow for dropdowns and modals',
    type: 'color',
    defaultValue: '0 4px 6px rgba(0,0,0,0.1)',
    currentValue: '0 4px 6px rgba(0,0,0,0.1)',
  },
  {
    name: 'shadow-lg',
    category: 'shadow',
    cssVar: '--vestara-shadow-lg',
    label: 'Large Shadow',
    description: 'Large shadow for elevated surfaces',
    type: 'color',
    defaultValue: '0 10px 15px rgba(0,0,0,0.1)',
    currentValue: '0 10px 15px rgba(0,0,0,0.1)',
  },

  // ── Motion ──
  {
    name: 'motion-fast',
    category: 'motion',
    cssVar: '--vestara-motion-fast',
    label: 'Fast Motion',
    description: 'Fast transition duration (150ms)',
    type: 'number',
    defaultValue: '150ms',
    currentValue: '150ms',
  },
  {
    name: 'motion-normal',
    category: 'motion',
    cssVar: '--vestara-motion-normal',
    label: 'Normal Motion',
    description: 'Normal transition duration (200ms)',
    type: 'number',
    defaultValue: '200ms',
    currentValue: '200ms',
  },
  {
    name: 'motion-slow',
    category: 'motion',
    cssVar: '--vestara-motion-slow',
    label: 'Slow Motion',
    description: 'Slow transition duration (300ms)',
    type: 'number',
    defaultValue: '300ms',
    currentValue: '300ms',
  },

  // ── Typography ──
  {
    name: 'typography-font-family',
    category: 'typography',
    cssVar: '--vestara-font-family',
    label: 'Font Family',
    description: 'Base font family stack',
    type: 'font-stack',
    defaultValue: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    currentValue: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  },
  {
    name: 'typography-font-size-base',
    category: 'typography',
    cssVar: '--vestara-font-size-base',
    label: 'Base Font Size',
    description: 'Base font size for body text',
    type: 'length',
    defaultValue: '14.25px',
    currentValue: '14.25px',
  },
  {
    name: 'typography-font-size-sm',
    category: 'typography',
    cssVar: '--vestara-font-size-sm',
    label: 'Small Font Size',
    description: 'Small font size for secondary text',
    type: 'length',
    defaultValue: '12.25px',
    currentValue: '12.25px',
  },
  {
    name: 'typography-font-size-xs',
    category: 'typography',
    cssVar: '--vestara-font-size-xs',
    label: 'Extra Small Font Size',
    description: 'Extra small font size for captions',
    type: 'length',
    defaultValue: '10.75px',
    currentValue: '10.75px',
  },
  {
    name: 'typography-font-size-lg',
    category: 'typography',
    cssVar: '--vestara-font-size-lg',
    label: 'Large Font Size',
    description: 'Large font size for headings',
    type: 'length',
    defaultValue: '16.25px',
    currentValue: '16.25px',
  },
  {
    name: 'typography-font-weight-normal',
    category: 'typography',
    cssVar: '--vestara-font-weight-normal',
    label: 'Normal Font Weight',
    description: 'Normal font weight (400)',
    type: 'number',
    defaultValue: '400',
    currentValue: '400',
  },
  {
    name: 'typography-font-weight-medium',
    category: 'typography',
    cssVar: '--vestara-font-weight-medium',
    label: 'Medium Font Weight',
    description: 'Medium font weight (500)',
    type: 'number',
    defaultValue: '500',
    currentValue: '500',
  },
  {
    name: 'typography-font-weight-semibold',
    category: 'typography',
    cssVar: '--vestara-font-weight-semibold',
    label: 'Semibold Font Weight',
    description: 'Semibold font weight (600)',
    type: 'number',
    defaultValue: '600',
    currentValue: '600',
  },
  {
    name: 'typography-sidebar-width',
    category: 'typography',
    cssVar: '--vestara-sidebar-width',
    label: 'Sidebar Width',
    description: 'Width of the sidebar navigation',
    type: 'length',
    defaultValue: '240px',
    currentValue: '240px',
  },
  {
    name: 'typography-page-max-width',
    category: 'typography',
    cssVar: '--vestara-page-max-width',
    label: 'Page Max Width',
    description: 'Maximum content width',
    type: 'length',
    defaultValue: '1280px',
    currentValue: '1280px',
  },
];

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
