// v2 Settings model on @vestara/settings-framework.
//
// The framework owns the settings *model* (module/section/entry registry +
// validation rules + defaults). Persistence stays with the workspace settings
// authority (GET/PATCH /api/settings) — the framework's SQLite store is
// intentionally not adopted: the browser has no SQLite and the API owns the
// persisted layers. Option labels live in settings.fixtures.ts and are
// registered into the model once, so fixtures stay the single definition
// point and the component never hardcodes options in JSX.

import {
  ModuleRegistry,
  type SettingsDatabase,
  type SettingsEntry,
  SettingsSchemas,
  SettingsStore,
  SHELL_APPEARANCE_DEFAULTS,
  type ShellAccentTheme,
  type ShellAppearanceSettings,
  ValidationEngine,
} from '@vestara/settings-framework';
import {
  APPEARANCE_THEME_OPTIONS,
  type UiVersionOption,
  WORKSPACE_UI_VERSION_FIXTURE,
  WORKSPACE_UI_VERSION_OPTIONS,
} from '../packages/settings.fixtures';
import type { WorkspaceUiVersion } from './workspace-ui-version';

export const WORKSPACE_UI_MODULE_KEY = 'workspace.ui';
export const UI_VERSION_ENTRY_KEY = 'uiVersion';
export const UI_VERSION_API_KEY = 'general.workspaceUiVersion';

/** Authority default for the shared setting (v1 stable). */
export const UI_VERSION_MODEL_DEFAULT: WorkspaceUiVersion = 'v1';

/** In-memory SettingsDatabase — the engine only needs validation, not rows. */
class MemorySettingsDatabase implements SettingsDatabase {
  run(): void {}
  get(): Record<string, unknown> | undefined {
    return undefined;
  }
  all(): Record<string, unknown>[] {
    return [];
  }
}

interface WorkspaceSettingsModel {
  entry: SettingsEntry;
  validation: ValidationEngine;
}

let model: WorkspaceSettingsModel | null = null;

/** Shared registry so module counts span every registered module. */
const sharedRegistry = new ModuleRegistry();

function isUiVersionOptionList(value: unknown): value is UiVersionOption[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        ((item as UiVersionOption).value === 'v1' || (item as UiVersionOption).value === 'v2') &&
        typeof (item as UiVersionOption).label === 'string',
    )
  );
}

/** Build (once) and return the workspace settings model. */
export function workspaceSettingsModel(): WorkspaceSettingsModel {
  if (model) return model;
  const registry = sharedRegistry;
  const module = registry.register({
    name: 'Workspace UI',
    description: 'Which UI build the API serves (v1 stable, v2 next).',
    path: '/settings/workspace-ui',
  });
  const section = registry.registerSection({
    moduleId: module.id,
    name: 'Version',
    description: 'Active workspace UI build.',
    component: 'WorkspaceUiToggle',
  });
  const entry = registry.registerEntry({
    moduleId: module.id,
    sectionId: section.id,
    key: UI_VERSION_ENTRY_KEY,
    type: 'select',
    label: 'Workspace UI version',
    description: 'Which UI build the API serves.',
    defaultValue: UI_VERSION_MODEL_DEFAULT,
    metadata: { options: WORKSPACE_UI_VERSION_OPTIONS, apiKey: UI_VERSION_API_KEY },
  });
  const store = new SettingsStore(registry, new MemorySettingsDatabase());
  const validation = new ValidationEngine(registry, store);
  validation.register({
    moduleId: module.id,
    key: UI_VERSION_ENTRY_KEY,
    schema: SettingsSchemas.enum(['v1', 'v2'] as const),
    errorMessage: 'Workspace UI version must be v1 or v2.',
  });
  model = { entry, validation };
  return model;
}

/** Toggle options from the registered entry (fixture-backed, never hardcoded). */
export function uiVersionOptions(): UiVersionOption[] {
  const options = workspaceSettingsModel().entry.metadata?.options;
  return isUiVersionOptionList(options) ? options : [...WORKSPACE_UI_VERSION_OPTIONS];
}

/** Model default for the shared setting. */
export function uiVersionDefault(): WorkspaceUiVersion {
  const fallback = workspaceSettingsModel().entry.defaultValue;
  return fallback === 'v1' || fallback === 'v2' ? fallback : UI_VERSION_MODEL_DEFAULT;
}

/** Offline fallback for this shell (v2) — fixture-backed. */
export function uiVersionFixture(): WorkspaceUiVersion {
  return WORKSPACE_UI_VERSION_FIXTURE;
}

/** Validate a candidate value through the framework's validation engine. */
export async function isValidUiVersion(value: unknown): Promise<boolean> {
  const { entry, validation } = workspaceSettingsModel();
  const result = await validation.validate(entry.moduleId, entry.key, value);
  return result.valid;
}

/** Count of registered settings modules (powers the About panel). */
export function settingsModuleCount(): number {
  workspaceSettingsModel();
  shellAppearanceModel();
  return sharedRegistry.getAll().length;
}

// ─── Shell appearance (framework SHELL_APPEARANCE contract) ──────────────
// Browser-local only: validated by the engine, persisted to localStorage,
// applied live by overriding shell CSS vars. The API settings authority
// does not own shell chrome, so no server round-trip happens here.

export const SHELL_APPEARANCE_STORAGE_KEY = 'vestara-shell-appearance';
const ACCENT_THEME_ENTRY_KEY = 'accentTheme';
const COMPACT_TOPBAR_ENTRY_KEY = 'compactTopBar';

function isAccentTheme(value: unknown): value is ShellAccentTheme {
  return (
    typeof value === 'string' &&
    (APPEARANCE_THEME_OPTIONS as { value: string }[]).some((option) => option.value === value)
  );
}

interface ShellAppearanceModel {
  moduleId: string;
  validation: ValidationEngine;
}

let appearanceModel: ShellAppearanceModel | null = null;

/** Build (once) the shell appearance model. */
export function shellAppearanceModel(): ShellAppearanceModel {
  if (appearanceModel) return appearanceModel;
  const module = sharedRegistry.register({
    name: 'Shell Appearance',
    description: 'Desktop shell accent and density.',
    path: '/settings/appearance',
  });
  const section = sharedRegistry.registerSection({
    moduleId: module.id,
    name: 'Appearance',
    description: 'Accent theme and TopBar density.',
    component: 'AppearanceCard',
  });
  sharedRegistry.registerEntry({
    moduleId: module.id,
    sectionId: section.id,
    key: ACCENT_THEME_ENTRY_KEY,
    type: 'select',
    label: 'Accent theme',
    description: 'Shell highlight color.',
    defaultValue: SHELL_APPEARANCE_DEFAULTS.accentTheme,
    metadata: { options: APPEARANCE_THEME_OPTIONS },
  });
  sharedRegistry.registerEntry({
    moduleId: module.id,
    sectionId: section.id,
    key: COMPACT_TOPBAR_ENTRY_KEY,
    type: 'boolean',
    label: 'Compact TopBar',
    description: '32px compact desktop top bar.',
    defaultValue: SHELL_APPEARANCE_DEFAULTS.compactTopBar,
  });
  const store = new SettingsStore(sharedRegistry, new MemorySettingsDatabase());
  const validation = new ValidationEngine(sharedRegistry, store);
  validation.register({
    moduleId: module.id,
    key: ACCENT_THEME_ENTRY_KEY,
    schema: SettingsSchemas.enum(['shell', 'amber', 'teal', 'emerald', 'blue', 'violet', 'rose', 'neutral'] as const),
    errorMessage: 'Accent theme must be a registered shell theme.',
  });
  validation.register({
    moduleId: module.id,
    key: COMPACT_TOPBAR_ENTRY_KEY,
    schema: SettingsSchemas.boolean,
    errorMessage: 'Compact TopBar must be a boolean.',
  });
  appearanceModel = { moduleId: module.id, validation };
  return appearanceModel;
}

/** Accent options from the registered entry (fixture-backed, never hardcoded). */
export function accentThemeOptions(): { value: ShellAccentTheme; label: string }[] {
  const entry = sharedRegistry
    .getAll()
    .flatMap((module) => sharedRegistry.getEntriesByModule(module.id))
    .find((item) => item.key === ACCENT_THEME_ENTRY_KEY);
  const options = entry?.metadata?.options;
  if (
    Array.isArray(options) &&
    options.every((item) => typeof item === 'object' && item !== null && isAccentTheme(item.value))
  ) {
    return options as { value: ShellAccentTheme; label: string }[];
  }
  return [...APPEARANCE_THEME_OPTIONS];
}

/** Read validated shell appearance (stored value over framework defaults). */
export async function loadShellAppearance(): Promise<ShellAppearanceSettings> {
  const { moduleId, validation } = shellAppearanceModel();
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(localStorage.getItem(SHELL_APPEARANCE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const accent = stored.accentTheme;
  const compact = stored.compactTopBar;
  return {
    accentTheme: (await validation.validate(moduleId, ACCENT_THEME_ENTRY_KEY, accent)).valid
      ? (accent as ShellAccentTheme)
      : SHELL_APPEARANCE_DEFAULTS.accentTheme,
    compactTopBar: (await validation.validate(moduleId, COMPACT_TOPBAR_ENTRY_KEY, compact)).valid
      ? (compact as boolean)
      : SHELL_APPEARANCE_DEFAULTS.compactTopBar,
  };
}

/** Validate, persist, and apply a shell appearance patch. */
export async function saveShellAppearance(patch: Partial<ShellAppearanceSettings>): Promise<ShellAppearanceSettings> {
  const { moduleId, validation } = shellAppearanceModel();
  const current = await loadShellAppearance();
  const next: ShellAppearanceSettings = { ...current, ...patch };
  const accent = await validation.validate(moduleId, ACCENT_THEME_ENTRY_KEY, next.accentTheme);
  if (!accent.valid) throw new Error(accent.error ?? 'Invalid accent theme.');
  const compact = await validation.validate(moduleId, COMPACT_TOPBAR_ENTRY_KEY, next.compactTopBar);
  if (!compact.valid) throw new Error(compact.error ?? 'Invalid TopBar density.');
  localStorage.setItem(SHELL_APPEARANCE_STORAGE_KEY, JSON.stringify(next));
  applyShellAppearance(next);
  return next;
}

/** Apply appearance live by overriding shell CSS vars (no-op without a DOM). */
export function applyShellAppearance(settings: ShellAppearanceSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (settings.accentTheme === SHELL_APPEARANCE_DEFAULTS.accentTheme) {
    root.style.removeProperty('--vestara-accent-shell');
    root.style.removeProperty('--vestara-accent-shell-glow');
  } else {
    root.style.setProperty('--vestara-accent-shell', `var(--vestara-accent-theme-${settings.accentTheme})`);
    root.style.setProperty('--vestara-accent-shell-glow', `var(--vestara-accent-theme-${settings.accentTheme}-glow)`);
  }
  if (settings.compactTopBar) {
    root.style.removeProperty('--vestara-sizing-topbar-height');
  } else {
    root.style.setProperty('--vestara-sizing-topbar-height', 'var(--vestara-sizing-topbar-height-comfortable)');
  }
}

/** Load the persisted appearance and apply it (shell boot path). */
export async function applyPersistedShellAppearance(): Promise<void> {
  applyShellAppearance(await loadShellAppearance());
}
