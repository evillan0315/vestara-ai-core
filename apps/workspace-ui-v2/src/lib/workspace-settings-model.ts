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
  ValidationEngine,
} from '@vestara/settings-framework';
import {
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
  const registry = new ModuleRegistry();
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
