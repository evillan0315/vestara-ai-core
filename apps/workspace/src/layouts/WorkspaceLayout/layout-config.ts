/**
 * Reusable WorkspaceLayout configuration — schema, defaults, and migration.
 *
 * Single source of truth for the configurable workspace layout planned in
 * Settings → Workspace → Layout. Pure TypeScript: no React, no DOM, no
 * storage — persistence lives in lib/layout-config-store.ts (mirroring
 * lib/navigation-store.ts), presentation lives in WorkspaceLayout.tsx.
 *
 * Authority boundaries (do not blur):
 * - Tokens own every visual value. This file holds no colors, spacing, or
 *   radii — only structural choices (style names, booleans, pixel widths).
 * - `density` mirrors ThemeSettings.spacing vocabulary (compact/comfortable/
 *   spacious). Theme/appearance authority stays in lib/theme.tsx.
 * - DISPLAYED VALUE ≠ USER OVERRIDE ≠ EFFECTIVE VALUE — rows render
 *   resolved store state; this file holds defaults and validation only.
 */

export const LAYOUT_CONFIG_VERSION = 1;

export type NavigationStyle = 'sidebar' | 'topbar' | 'rail' | 'hidden';
export type NavigationPosition = 'left' | 'right';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type CenterTabStyle = 'underline' | 'pill' | 'box';
export type BorderStyle = 'subtle' | 'strong' | 'none';
export type CardStyle = 'flat' | 'elevated' | 'outlined';

export interface LayoutNavigationConfig {
  style: NavigationStyle;
  position: NavigationPosition;
  collapsible: boolean;
  showIcons: boolean;
  showCounts: boolean;
}

export interface LeftPanelConfig {
  enabled: boolean;
  /** Resizable width, clamped to LEFT_PANEL_WIDTH_MIN/MAX. */
  width: number;
  defaultTab: string;
  resizable: boolean;
}

export interface CenterPanelConfig {
  showBreadcrumbs: boolean;
  showTabs: boolean;
  tabStyle: CenterTabStyle;
}

export interface RightPanelConfig {
  enabled: boolean;
  /** Resizable width, clamped to RIGHT_PANEL_WIDTH_MIN/MAX. */
  width: number;
  defaultTab: string;
  collapsible: boolean;
}

export interface LayoutAppearanceConfig {
  borderStyle: BorderStyle;
  cardStyle: CardStyle;
}

export interface LayoutBehaviorConfig {
  virtualizedFileTree: boolean;
  focusMode: boolean;
  commandPalette: boolean;
  autoSaveLayout: boolean;
}

export interface LayoutConfig {
  version: number;
  navigation: LayoutNavigationConfig;
  density: LayoutDensity;
  panels: {
    leftPanel: LeftPanelConfig;
    centerPanel: CenterPanelConfig;
    rightPanel: RightPanelConfig;
  };
  appearance: LayoutAppearanceConfig;
  behavior: LayoutBehaviorConfig;
}

export const LEFT_PANEL_WIDTH_MIN = 200;
export const LEFT_PANEL_WIDTH_MAX = 400;
export const RIGHT_PANEL_WIDTH_MIN = 240;
export const RIGHT_PANEL_WIDTH_MAX = 420;

export const LEFT_PANEL_TABS = ['files', 'capabilities', 'search'] as const;
export const RIGHT_PANEL_TABS = ['inspector', 'details', 'activity'] as const;

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  version: LAYOUT_CONFIG_VERSION,
  navigation: {
    style: 'sidebar',
    position: 'left',
    collapsible: true,
    showIcons: true,
    showCounts: true,
  },
  density: 'comfortable',
  panels: {
    leftPanel: { enabled: true, width: 280, defaultTab: 'files', resizable: true },
    centerPanel: { showBreadcrumbs: true, showTabs: true, tabStyle: 'underline' },
    rightPanel: { enabled: true, width: 300, defaultTab: 'inspector', collapsible: true },
  },
  appearance: { borderStyle: 'subtle', cardStyle: 'outlined' },
  behavior: {
    virtualizedFileTree: true,
    focusMode: false,
    commandPalette: true,
    autoSaveLayout: false,
  },
};

/** Dot-paths the Settings UI may write (mirrors the artifact's `w(path, value)`). */
export type LayoutConfigPath =
  | 'navigation.style'
  | 'navigation.position'
  | 'navigation.collapsible'
  | 'navigation.showIcons'
  | 'navigation.showCounts'
  | 'density'
  | 'panels.leftPanel.enabled'
  | 'panels.leftPanel.width'
  | 'panels.leftPanel.defaultTab'
  | 'panels.leftPanel.resizable'
  | 'panels.centerPanel.showBreadcrumbs'
  | 'panels.centerPanel.showTabs'
  | 'panels.centerPanel.tabStyle'
  | 'panels.rightPanel.enabled'
  | 'panels.rightPanel.width'
  | 'panels.rightPanel.defaultTab'
  | 'panels.rightPanel.collapsible'
  | 'appearance.borderStyle'
  | 'appearance.cardStyle'
  | 'behavior.virtualizedFileTree'
  | 'behavior.focusMode'
  | 'behavior.commandPalette'
  | 'behavior.autoSaveLayout';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickTab(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function clampWidth(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Merge an unknown payload onto defaults. Never throws: unknown enums fall
 * back per-field, widths clamp, non-objects yield defaults. Forward-compatible:
 * unknown keys are dropped, missing keys are filled.
 */
export function migrateLayoutConfig(input: unknown): LayoutConfig {
  const defaults = DEFAULT_LAYOUT_CONFIG;
  if (!isRecord(input)) return structuredClone(defaults);
  const navigation = isRecord(input.navigation) ? input.navigation : {};
  const panels = isRecord(input.panels) ? input.panels : {};
  const left = isRecord(panels.leftPanel) ? panels.leftPanel : {};
  const center = isRecord(panels.centerPanel) ? panels.centerPanel : {};
  const right = isRecord(panels.rightPanel) ? panels.rightPanel : {};
  const appearance = isRecord(input.appearance) ? input.appearance : {};
  const behavior = isRecord(input.behavior) ? input.behavior : {};
  return {
    version: LAYOUT_CONFIG_VERSION,
    navigation: {
      style: pick(navigation.style, ['sidebar', 'topbar', 'rail', 'hidden'], defaults.navigation.style),
      position: pick(navigation.position, ['left', 'right'], defaults.navigation.position),
      collapsible: pickBoolean(navigation.collapsible, defaults.navigation.collapsible),
      showIcons: pickBoolean(navigation.showIcons, defaults.navigation.showIcons),
      showCounts: pickBoolean(navigation.showCounts, defaults.navigation.showCounts),
    },
    density: pick(input.density, ['compact', 'comfortable', 'spacious'], defaults.density),
    panels: {
      leftPanel: {
        enabled: pickBoolean(left.enabled, defaults.panels.leftPanel.enabled),
        width: clampWidth(left.width, LEFT_PANEL_WIDTH_MIN, LEFT_PANEL_WIDTH_MAX, defaults.panels.leftPanel.width),
        defaultTab: pickTab(left.defaultTab, LEFT_PANEL_TABS, defaults.panels.leftPanel.defaultTab),
        resizable: pickBoolean(left.resizable, defaults.panels.leftPanel.resizable),
      },
      centerPanel: {
        showBreadcrumbs: pickBoolean(center.showBreadcrumbs, defaults.panels.centerPanel.showBreadcrumbs),
        showTabs: pickBoolean(center.showTabs, defaults.panels.centerPanel.showTabs),
        tabStyle: pick(center.tabStyle, ['underline', 'pill', 'box'], defaults.panels.centerPanel.tabStyle),
      },
      rightPanel: {
        enabled: pickBoolean(right.enabled, defaults.panels.rightPanel.enabled),
        width: clampWidth(
          right.width,
          RIGHT_PANEL_WIDTH_MIN,
          RIGHT_PANEL_WIDTH_MAX,
          defaults.panels.rightPanel.width,
        ),
        defaultTab: pickTab(right.defaultTab, RIGHT_PANEL_TABS, defaults.panels.rightPanel.defaultTab),
        collapsible: pickBoolean(right.collapsible, defaults.panels.rightPanel.collapsible),
      },
    },
    appearance: {
      borderStyle: pick(appearance.borderStyle, ['subtle', 'strong', 'none'], defaults.appearance.borderStyle),
      cardStyle: pick(appearance.cardStyle, ['flat', 'elevated', 'outlined'], defaults.appearance.cardStyle),
    },
    behavior: {
      virtualizedFileTree: pickBoolean(behavior.virtualizedFileTree, defaults.behavior.virtualizedFileTree),
      focusMode: pickBoolean(behavior.focusMode, defaults.behavior.focusMode),
      commandPalette: pickBoolean(behavior.commandPalette, defaults.behavior.commandPalette),
      autoSaveLayout: pickBoolean(behavior.autoSaveLayout, defaults.behavior.autoSaveLayout),
    },
  };
}

export function isLayoutConfig(value: unknown): value is LayoutConfig {
  if (!isRecord(value)) return false;
  try {
    const migrated = migrateLayoutConfig(value);
    return JSON.stringify(migrated) === JSON.stringify(migrateLayoutConfig(migrated));
  } catch {
    return false;
  }
}

export interface ImportResult {
  ok: boolean;
  config?: LayoutConfig;
  error?: string;
}

/** Parse pasted JSON (Import dialog). Returns a migrated config or a human-readable error. */
export function parseLayoutConfigJson(raw: string): ImportResult {
  if (!raw.trim()) return { ok: false, error: 'Paste a layout config JSON document first.' };
  try {
    const parsed: unknown = JSON.parse(raw);
    return { ok: true, config: migrateLayoutConfig(parsed) };
  } catch {
    return { ok: false, error: 'Invalid JSON — check brackets and quoting, then try again.' };
  }
}

/**
 * Immutable dot-path update with the same validation as migration.
 * Unknown paths return the config unchanged.
 */
export function withLayoutPath(config: LayoutConfig, path: LayoutConfigPath, value: unknown): LayoutConfig {
  const next = structuredClone(config);
  switch (path) {
    case 'navigation.style':
      next.navigation.style = pick(value, ['sidebar', 'topbar', 'rail', 'hidden'], next.navigation.style);
      break;
    case 'navigation.position':
      next.navigation.position = pick(value, ['left', 'right'], next.navigation.position);
      break;
    case 'navigation.collapsible':
      next.navigation.collapsible = pickBoolean(value, next.navigation.collapsible);
      break;
    case 'navigation.showIcons':
      next.navigation.showIcons = pickBoolean(value, next.navigation.showIcons);
      break;
    case 'navigation.showCounts':
      next.navigation.showCounts = pickBoolean(value, next.navigation.showCounts);
      break;
    case 'density':
      next.density = pick(value, ['compact', 'comfortable', 'spacious'], next.density);
      break;
    case 'panels.leftPanel.enabled':
      next.panels.leftPanel.enabled = pickBoolean(value, next.panels.leftPanel.enabled);
      break;
    case 'panels.leftPanel.width':
      next.panels.leftPanel.width = clampWidth(
        value,
        LEFT_PANEL_WIDTH_MIN,
        LEFT_PANEL_WIDTH_MAX,
        next.panels.leftPanel.width,
      );
      break;
    case 'panels.leftPanel.defaultTab':
      next.panels.leftPanel.defaultTab = pickTab(value, LEFT_PANEL_TABS, next.panels.leftPanel.defaultTab);
      break;
    case 'panels.leftPanel.resizable':
      next.panels.leftPanel.resizable = pickBoolean(value, next.panels.leftPanel.resizable);
      break;
    case 'panels.centerPanel.showBreadcrumbs':
      next.panels.centerPanel.showBreadcrumbs = pickBoolean(value, next.panels.centerPanel.showBreadcrumbs);
      break;
    case 'panels.centerPanel.showTabs':
      next.panels.centerPanel.showTabs = pickBoolean(value, next.panels.centerPanel.showTabs);
      break;
    case 'panels.centerPanel.tabStyle':
      next.panels.centerPanel.tabStyle = pick(value, ['underline', 'pill', 'box'], next.panels.centerPanel.tabStyle);
      break;
    case 'panels.rightPanel.enabled':
      next.panels.rightPanel.enabled = pickBoolean(value, next.panels.rightPanel.enabled);
      break;
    case 'panels.rightPanel.width':
      next.panels.rightPanel.width = clampWidth(
        value,
        RIGHT_PANEL_WIDTH_MIN,
        RIGHT_PANEL_WIDTH_MAX,
        next.panels.rightPanel.width,
      );
      break;
    case 'panels.rightPanel.defaultTab':
      next.panels.rightPanel.defaultTab = pickTab(value, RIGHT_PANEL_TABS, next.panels.rightPanel.defaultTab);
      break;
    case 'panels.rightPanel.collapsible':
      next.panels.rightPanel.collapsible = pickBoolean(value, next.panels.rightPanel.collapsible);
      break;
    case 'appearance.borderStyle':
      next.appearance.borderStyle = pick(value, ['subtle', 'strong', 'none'], next.appearance.borderStyle);
      break;
    case 'appearance.cardStyle':
      next.appearance.cardStyle = pick(value, ['flat', 'elevated', 'outlined'], next.appearance.cardStyle);
      break;
    case 'behavior.virtualizedFileTree':
      next.behavior.virtualizedFileTree = pickBoolean(value, next.behavior.virtualizedFileTree);
      break;
    case 'behavior.focusMode':
      next.behavior.focusMode = pickBoolean(value, next.behavior.focusMode);
      break;
    case 'behavior.commandPalette':
      next.behavior.commandPalette = pickBoolean(value, next.behavior.commandPalette);
      break;
    case 'behavior.autoSaveLayout':
      next.behavior.autoSaveLayout = pickBoolean(value, next.behavior.autoSaveLayout);
      break;
  }
  return next;
}
