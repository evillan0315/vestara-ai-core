export type WorkspaceUiVersion = 'v1' | 'v2';

export const WORKSPACE_UI_VERSION_DEFAULT: WorkspaceUiVersion = 'v1';
export const WORKSPACE_UI_VERSION_OPTIONS: readonly WorkspaceUiVersion[] = ['v1', 'v2'];
export const WORKSPACE_UI_VERSION_ENV = 'VESTARA_WORKSPACE_UI_VERSION';
export const WORKSPACE_UI_VERSION_SETTING = 'general.workspaceUiVersion';

export function normalizeWorkspaceUiVersion(value: unknown): WorkspaceUiVersion | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'v1' || normalized === '1' || normalized === 'classic') return 'v1';
  if (normalized === 'v2' || normalized === '2' || normalized === 'next') return 'v2';
  return null;
}

/**
 * Resolve the active workspace UI version.
 * Precedence: explicit env value > workspace setting value > default (v1).
 * Unknown values fall back to the next layer (never throw on the hot path).
 */
export function resolveWorkspaceUiVersion(envValue?: unknown, settingValue?: unknown): WorkspaceUiVersion {
  return (
    normalizeWorkspaceUiVersion(envValue) ?? normalizeWorkspaceUiVersion(settingValue) ?? WORKSPACE_UI_VERSION_DEFAULT
  );
}
