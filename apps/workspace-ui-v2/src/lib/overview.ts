// Live overview-health client — API first, fixtures as offline fallback.
// Contract: apps/api/src/routes/misc.ts (GET /api/health → { status }).
// The Bearer token rides via assistantFetch (gateway VES-AUTH-001
// authenticates every /api/*); transport failures reject so callers fall
// back to fixtures.

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export type OverviewHealth = 'healthy' | 'degraded';

export class OverviewApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OverviewApiError';
    this.status = status;
  }
}

/** GET /api/health — Bearer token rides via assistantFetch (gateway VES-AUTH-001). */
export async function fetchOverviewHealth(): Promise<OverviewHealth> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/health`);
  } catch {
    throw new OverviewApiError(0, 'Health API unreachable');
  }
  if (!res.ok) throw new OverviewApiError(res.status, `Request failed (${res.status})`);
  try {
    const data = (await res.json()) as { status?: string };
    return data?.status === 'ok' ? 'healthy' : 'degraded';
  } catch {
    return 'degraded';
  }
}
