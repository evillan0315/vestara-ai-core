/**
 * CI-UI-003 — Live CI status hook.
 *
 * One cohesive request to the provider-neutral `GET /api/ci/status` boundary.
 * React never calls GitHub. A failed/absent boundary yields an explicit
 * unavailable result rather than fabricated view state.
 */

import { useCallback, useEffect, useState } from 'react';
import { type CIStatusResponse, type CIStatusView, viewFromCIStatus } from './ci-read-model.js';

export interface CIStatusResult {
  /** Mapped view state when the read boundary answered. */
  readonly view?: CIStatusView;
  readonly availability: 'available' | 'unavailable';
  readonly detail?: string;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function useCIStatus(): CIStatusResult {
  const [view, setView] = useState<CIStatusView | undefined>(undefined);
  const [availability, setAvailability] = useState<'available' | 'unavailable'>('unavailable');
  const [detail, setDetail] = useState<string | undefined>('Loading CI status…');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/ci/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const payload = (await response.json()) as CIStatusResponse;
        if (cancelled) return;
        setView(viewFromCIStatus(payload));
        setAvailability('available');
        setDetail(undefined);
      } catch (error) {
        if (cancelled) return;
        setView(undefined);
        setAvailability('unavailable');
        setDetail(error instanceof Error ? error.message : 'CI status is unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return {
    ...(view !== undefined ? { view } : {}),
    availability,
    ...(detail !== undefined ? { detail } : {}),
    loading,
    refresh,
  };
}
