// Live agents client — API first, fixtures as offline fallback.
// Contracts: apps/api/src/routes/agents.ts (GET /api/agents →
// { agents, executions, runtime }). The Bearer token rides via assistantFetch
// (gateway VES-AUTH-001 authenticates every /api/*); transport failures and
// 401s reject so callers fall back to fixtures (offline-first, per the
// assistant-api discipline).

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export interface LiveAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  provider: string;
  model: string;
}

export class AgentsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AgentsApiError';
    this.status = status;
  }
}

async function readError(res: Response, fallback: string): Promise<AgentsApiError> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    // Non-JSON error body — keep the fallback.
  }
  return new AgentsApiError(res.status, message);
}

function normalizeAgent(raw: {
  id?: unknown;
  name?: unknown;
  role?: unknown;
  status?: unknown;
  provider?: unknown;
  model?: unknown;
}): LiveAgent | null {
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !raw.name) return null;
  return {
    id: raw.id,
    name: raw.name,
    role: typeof raw.role === 'string' && raw.role ? raw.role : 'Agent',
    status: typeof raw.status === 'string' && raw.status ? raw.status : 'offline',
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    model: typeof raw.model === 'string' && raw.model ? raw.model : 'unknown',
  };
}

/** GET /api/agents — Bearer token rides via assistantFetch (gateway VES-AUTH-001). */
export async function fetchAgents(): Promise<LiveAgent[]> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/agents`);
  } catch {
    throw new AgentsApiError(0, 'Agents API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  const data = (await res.json()) as { agents?: unknown };
  if (!Array.isArray(data?.agents)) return [];
  return data.agents
    .map((entry) => normalizeAgent((entry ?? {}) as Parameters<typeof normalizeAgent>[0]))
    .filter((entry): entry is LiveAgent => entry !== null);
}

/**
 * Overlay live API agents onto the canonical roster: live status/provider/
 * model win when the API knows the agent id; canonical entries cover the
 * rest; unknown live agents append. Guarantees the current v1 roster is
 * always rendered, live-enriched when the API is reachable.
 */
export function mergeAgentsWithCanonical(canonical: readonly LiveAgent[], live: readonly LiveAgent[]): LiveAgent[] {
  const byId = new Map(live.map((a) => [a.id, a]));
  const merged = canonical.map((c) => {
    const l = byId.get(c.id);
    if (!l) return { ...c };
    byId.delete(c.id);
    return { ...c, status: l.status, provider: l.provider, model: l.model };
  });
  for (const extra of byId.values()) merged.push({ ...extra });
  return merged;
}
