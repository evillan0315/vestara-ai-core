// Live providers + routing-selection client — API first, fixtures fallback.
// Contracts: apps/api/src/routes/providers.ts (GET /api/providers →
// { providers }) and apps/api/src/routes/routing.ts
// (GET/PATCH /api/routing/selection). The Bearer token rides via
// assistantFetch (gateway VES-AUTH-001 authenticates every /api/*);
// PATCH additionally requires editor role. Transport failures reject so
// callers fall back to fixtures (offline-first).

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export interface LiveModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface LiveProvider {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  models: LiveModel[];
}

export interface ProviderModelRef {
  providerId: string;
  modelId: string;
}

export interface RoutingSelection {
  revision: number;
  updatedByClientId: string;
  selection: {
    profileId: string;
    roles: Record<string, ProviderModelRef>;
  };
}

export class ProvidersApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProvidersApiError';
    this.status = status;
  }
}

async function readError(res: Response, fallback: string): Promise<ProvidersApiError> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    // Non-JSON error body — keep the fallback.
  }
  return new ProvidersApiError(res.status, message);
}

function normalizeModel(raw: { id?: unknown; name?: unknown; enabled?: unknown }): LiveModel | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
    enabled: raw.enabled !== false,
  };
}

function normalizeProvider(raw: {
  id?: unknown;
  name?: unknown;
  enabled?: unknown;
  status?: unknown;
  models?: unknown;
}): LiveProvider | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
    enabled: raw.enabled !== false,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    models: Array.isArray(raw.models)
      ? raw.models
          .map((m) => normalizeModel((m ?? {}) as Parameters<typeof normalizeModel>[0]))
          .filter((m): m is LiveModel => m !== null)
      : [],
  };
}

function normalizeRef(raw: { providerId?: unknown; modelId?: unknown }): ProviderModelRef | null {
  if (typeof raw.providerId !== 'string' || !raw.providerId) return null;
  if (typeof raw.modelId !== 'string' || !raw.modelId) return null;
  return { providerId: raw.providerId, modelId: raw.modelId };
}

function normalizeSelection(data: {
  revision?: unknown;
  updatedByClientId?: unknown;
  selection?: { profileId?: unknown; roles?: unknown };
}): RoutingSelection | null {
  if (!Number.isInteger(data.revision)) return null;
  const profileId = data.selection?.profileId;
  const roles = data.selection?.roles;
  if (typeof profileId !== 'string' || typeof roles !== 'object' || roles === null) return null;
  const normalizedRoles: Record<string, ProviderModelRef> = {};
  for (const [role, ref] of Object.entries(roles as Record<string, unknown>)) {
    const parsed = normalizeRef((ref ?? {}) as Parameters<typeof normalizeRef>[0]);
    if (parsed) normalizedRoles[role] = parsed;
  }
  return {
    revision: data.revision as number,
    updatedByClientId: typeof data.updatedByClientId === 'string' ? data.updatedByClientId : '',
    selection: { profileId, roles: normalizedRoles },
  };
}

/** GET /api/providers — Bearer token rides via assistantFetch (gateway VES-AUTH-001). */
export async function fetchProviders(): Promise<LiveProvider[]> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/providers`);
  } catch {
    throw new ProvidersApiError(0, 'Providers API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  const data = (await res.json()) as { providers?: unknown };
  if (!Array.isArray(data?.providers)) return [];
  return data.providers
    .map((entry) => normalizeProvider((entry ?? {}) as Parameters<typeof normalizeProvider>[0]))
    .filter((entry): entry is LiveProvider => entry !== null);
}

/** GET /api/routing/selection — Bearer token rides via assistantFetch. */
export async function fetchRoutingSelection(): Promise<RoutingSelection | null> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/routing/selection`);
  } catch {
    throw new ProvidersApiError(0, 'Routing API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  return normalizeSelection((await res.json()) as Parameters<typeof normalizeSelection>[0]);
}

/**
 * PATCH /api/routing/selection — assigns one role's provider+model.
 * Requires an editor Bearer token; 401/403 reject with the server message.
 */
export async function saveRoutingAssignment(
  current: RoutingSelection,
  role: string,
  ref: ProviderModelRef,
): Promise<RoutingSelection> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/routing/selection`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selection: {
          profileId: current.selection.profileId,
          roles: { ...current.selection.roles, [role]: ref },
        },
        expectedRevision: current.revision,
        updatedByClientId: 'workspace-ui-v2',
      }),
    });
  } catch {
    throw new ProvidersApiError(0, 'Routing API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  const next = normalizeSelection((await res.json()) as Parameters<typeof normalizeSelection>[0]);
  if (!next) throw new ProvidersApiError(500, 'Routing update returned no selection');
  return next;
}
