// Workspace UI version toggle client (v1 stable ↔ v2 next).
// Contracts: apps/api/src/routes/workspace.ts (GET/PATCH /api/settings) and
// apps/api/src/routes/system-environment.ts (GET /api/system/environment).
// Transport failures reject — callers fall back to fixtures (offline-first,
// per the assistant-api discipline). Auth rides the persisted assistant
// Bearer token via assistantFetch; PATCH additionally requires editor role.

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export type WorkspaceUiVersion = 'v1' | 'v2';

export const WORKSPACE_UI_VERSION_KEY = 'general.workspaceUiVersion';
const WORKSPACE_UI_VERSION_ENV = 'VESTARA_WORKSPACE_UI_VERSION';

export function normalizeUiVersion(value: unknown): WorkspaceUiVersion | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'v1' || normalized === '1' || normalized === 'classic') return 'v1';
  if (normalized === 'v2' || normalized === '2' || normalized === 'next') return 'v2';
  return null;
}

export class UiVersionApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UiVersionApiError';
    this.status = status;
  }
}

interface SettingEntry {
  key?: string;
  value?: unknown;
}

interface ResolvedConfigurationBody {
  revision?: string;
  settings?: SettingEntry[];
}

interface EnvironmentVariableBody {
  name?: string;
  effectiveSource?: string;
  effectiveValue?: string;
}

async function readError(res: Response, fallback: string): Promise<UiVersionApiError> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    // Non-JSON error body — keep the fallback.
  }
  return new UiVersionApiError(res.status, message);
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}${path}`);
  } catch {
    throw new UiVersionApiError(0, 'Workspace API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export type UiVersionSource = 'api' | 'environment' | 'fixture';

export interface UiVersionState {
  version: WorkspaceUiVersion;
  /** Settings revision for optimistic-concurrency saves; null when fixture. */
  revision: string | null;
  source: UiVersionSource;
  /** True when VESTARA_WORKSPACE_UI_VERSION is set — the toggle is locked. */
  envLocked: boolean;
}

/**
 * Read the effective UI version: persisted setting, unless the environment
 * overlay wins (effectiveSource === 'environment'), in which case the env
 * value is authoritative and the toggle must render locked.
 */
export async function fetchUiVersionState(): Promise<UiVersionState> {
  const [configuration, environment] = await Promise.all([
    getJson<ResolvedConfigurationBody>('/api/settings'),
    getJson<{ variables?: EnvironmentVariableBody[] }>('/api/system/environment'),
  ]);
  const entry = configuration.settings?.find((setting) => setting.key === WORKSPACE_UI_VERSION_KEY);
  const settingVersion = normalizeUiVersion(entry?.value) ?? 'v1';
  const envEntry = environment.variables?.find((variable) => variable.name === WORKSPACE_UI_VERSION_ENV);
  if (envEntry?.effectiveSource === 'environment') {
    return {
      version: normalizeUiVersion(envEntry.effectiveValue) ?? settingVersion,
      revision: typeof configuration.revision === 'string' ? configuration.revision : null,
      source: 'environment',
      envLocked: true,
    };
  }
  return {
    version: settingVersion,
    revision: typeof configuration.revision === 'string' ? configuration.revision : null,
    source: 'api',
    envLocked: false,
  };
}

/**
 * Persist the UI version (PATCH /api/settings, section general).
 * 401/403 → sign in with an editor account; 409 → revision moved, refetch.
 */
export async function saveUiVersion(version: WorkspaceUiVersion, revision: string | null): Promise<UiVersionState> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        section: 'general',
        overrides: { [WORKSPACE_UI_VERSION_KEY]: version },
        ...(revision ? { expectedRevision: revision } : {}),
        source: 'workspace-ui',
      }),
    });
  } catch {
    throw new UiVersionApiError(0, 'Workspace API unreachable');
  }
  if (res.status === 401 || res.status === 403)
    throw new UiVersionApiError(res.status, 'Sign in with an editor account to switch the workspace UI.');
  if (res.status === 409) throw new UiVersionApiError(409, 'Settings changed elsewhere — reloading.');
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  const data = (await res.json()) as { configuration?: ResolvedConfigurationBody };
  const configuration = data?.configuration;
  const entry = configuration?.settings?.find((setting) => setting.key === WORKSPACE_UI_VERSION_KEY);
  return {
    version: normalizeUiVersion(entry?.value) ?? version,
    revision: typeof configuration?.revision === 'string' ? configuration.revision : revision,
    source: 'api',
    envLocked: false,
  };
}
