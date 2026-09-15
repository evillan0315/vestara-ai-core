/**
 * VES-OVERVIEW-001: Milestones Query Hook
 *
 * Reads the existing milestone authority projection (`GET /api/milestones`,
 * served from MilestoneService) — status, current focus, and aggregate
 * progress. Read-only: the Overview never writes milestone state.
 *
 * No fabrication: when the API is unreachable the hook returns null and the
 * card renders an honest unavailable state. Milestone rows are never
 * invented from fixtures — Overview ≠ Milestone authority.
 */

import { useCallback, useEffect, useState } from 'react';

export type AuthorityMilestoneStatus = 'pending' | 'in_progress' | 'completed';

export interface AuthorityMilestone {
  readonly version: string;
  readonly name: string;
  readonly era: string;
  readonly status: AuthorityMilestoneStatus;
  readonly description: string;
  readonly completedAt?: string;
}

export interface MilestonesProjection {
  readonly milestones: readonly AuthorityMilestone[];
  readonly current: AuthorityMilestone | null;
  readonly progress: { readonly total: number; readonly completed: number; readonly inProgress: number; readonly pending: number };
}

export interface UseMilestonesReturn {
  readonly data: MilestonesProjection | null;
  readonly isLoading: boolean;
  readonly refetch: () => void;
}

export function useMilestones(): UseMilestonesReturn {
  const [data, setData] = useState<MilestonesProjection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/milestones', { headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) {
          if (!cancelled) {
            setData(null);
            setIsLoading(false);
          }
          return;
        }
        const body = (await res.json()) as {
          milestones?: AuthorityMilestone[];
          current?: AuthorityMilestone | null;
          progress?: MilestonesProjection['progress'];
        };
        if (!cancelled) {
          if (Array.isArray(body.milestones) && body.progress) {
            setData({ milestones: body.milestones, current: body.current ?? null, progress: body.progress });
          } else {
            setData(null);
          }
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refetch();
    return cleanup;
  }, [refetch]);

  return { data, isLoading, refetch: () => refetch() };
}
