/**
 * AR-UI-A0: useTeamRoster Hook
 *
 * React hook that provides the authoritative team roster data
 * to Activity Room components. Replaces placeholder data with
 * real agent data from the canonical registry.
 *
 * Architecture Traceability:
 *   AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RosterActivityPreview,
  TeamRosterConfig,
  TeamRosterEntry,
  TeamRosterState,
} from './team-roster-types';
import { DEFAULT_ROSTER_CONFIG } from './team-roster-types';
import { TeamRosterDataLayer } from './team-roster-data';

/**
 * AR-UI-A0: Return type for the useTeamRoster hook.
 */
export interface UseTeamRosterReturn {
  /** Current roster state */
  readonly state: TeamRosterState;

  /** Whether the roster is currently loading */
  readonly isLoading: boolean;

  /** Error message if roster fetch failed */
  readonly error: string | null;

  /** Refresh the roster from the API */
  readonly refresh: () => Promise<void>;

  /** Update an agent's runtime status */
  readonly updateAgentStatus: (agentId: string, status: TeamRosterEntry['runtimeStatus']) => void;

  /** Update an agent's latest activity */
  readonly updateAgentActivity: (agentId: string, activity: RosterActivityPreview) => void;

  /** Update an agent's active work count */
  readonly updateAgentWorkCount: (agentId: string, count: number) => void;

  /** Select an agent in the roster */
  readonly selectAgent: (agentId: string | null) => void;

  /** Get a specific agent entry by ID */
  readonly getAgent: (agentId: string) => TeamRosterEntry | undefined;
}

/**
 * AR-UI-A0: React hook for the authoritative team roster.
 *
 * @param config - Optional roster configuration
 * @param autoRefresh - Whether to auto-refresh (default: true, interval: 10s)
 */
export function useTeamRoster(
  config?: Partial<TeamRosterConfig>,
  autoRefresh: boolean = true,
): UseTeamRosterReturn {
  const [state, setState] = useState<TeamRosterState>({
    entries: [],
    activeCount: 0,
    idleCount: 0,
    errorCount: 0,
    totalCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataLayerRef = useRef<TeamRosterDataLayer>(
    new TeamRosterDataLayer(config),
  );

  // Fetch roster on mount
  useEffect(() => {
    let cancelled = false;

    const fetchRoster = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const newState = await dataLayerRef.current.fetchRoster();
        if (!cancelled) {
          setState(newState);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch roster');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchRoster();

    // Auto-refresh every 10 seconds
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      intervalId = setInterval(fetchRoster, 10_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const newState = await dataLayerRef.current.fetchRoster();
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch roster');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAgentStatus = useCallback((agentId: string, status: TeamRosterEntry['runtimeStatus']) => {
    dataLayerRef.current.updateAgentStatus(agentId, status);
    setState(dataLayerRef.current.getState());
  }, []);

  const updateAgentActivity = useCallback((agentId: string, activity: RosterActivityPreview) => {
    dataLayerRef.current.updateAgentActivity(agentId, activity);
    setState(dataLayerRef.current.getState());
  }, []);

  const updateAgentWorkCount = useCallback((agentId: string, count: number) => {
    dataLayerRef.current.updateAgentWorkCount(agentId, count);
    setState(dataLayerRef.current.getState());
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    dataLayerRef.current.selectAgent(agentId);
    setState(dataLayerRef.current.getState());
  }, []);

  const getAgent = useCallback((agentId: string) => {
    return state.entries.find((e) => e.agent.id === agentId);
  }, [state.entries]);

  return {
    state,
    isLoading,
    error,
    refresh,
    updateAgentStatus,
    updateAgentActivity,
    updateAgentWorkCount,
    selectAgent,
    getAgent,
  };
}
