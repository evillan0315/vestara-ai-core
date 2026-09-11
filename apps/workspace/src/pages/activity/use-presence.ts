/**
 * AR-UI-B0: usePresence Hook
 *
 * React hook that provides real-time presence data for agents
 * in the Activity Room. Tracks heartbeat, connection status,
 * and workspace-level presence aggregation.
 *
 * Architecture Traceability:
 *   AR-UI-B: Presence Layer (phases 3-6)
 *   @see AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PresenceConfig,
  PresenceEntry,
  PresenceEvent,
  PresenceStateData,
} from './presence-types';
import { DEFAULT_PRESENCE_CONFIG } from './presence-types';
import { PresenceDataLayer } from './presence-data';

/**
 * AR-UI-B0: Return type for the usePresence hook.
 */
export interface UsePresenceReturn {
  /** Current presence state */
  readonly state: PresenceStateData;

  /** Whether presence tracking is active */
  readonly isActive: boolean;

  /** Start presence tracking */
  readonly start: () => void;

  /** Stop presence tracking */
  readonly stop: () => void;

  /** Process a presence event */
  readonly handleEvent: (event: PresenceEvent) => void;

  /** Get a specific agent's presence */
  readonly getAgentPresence: (agentId: string) => PresenceEntry | undefined;

  /** Check if an agent is online */
  readonly isOnline: (agentId: string) => boolean;

  /** Check if an agent is busy */
  readonly isBusy: (agentId: string) => boolean;
}

/**
 * AR-UI-B0: React hook for real-time presence tracking.
 *
 * @param config - Optional presence configuration
 */
export function usePresence(
  config?: Partial<PresenceConfig>,
): UsePresenceReturn {
  const [state, setState] = useState<PresenceStateData>({
    entries: [],
    onlineCount: 0,
    idleCount: 0,
    busyCount: 0,
    offlineCount: 0,
    totalCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  });
  const [isActive, setIsActive] = useState(false);

  const dataLayerRef = useRef<PresenceDataLayer>(
    new PresenceDataLayer(config),
  );

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = dataLayerRef.current.onStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dataLayerRef.current.stop();
    };
  }, []);

  const start = useCallback(() => {
    dataLayerRef.current.start();
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    dataLayerRef.current.stop();
    setIsActive(false);
  }, []);

  const handleEvent = useCallback((event: PresenceEvent) => {
    dataLayerRef.current.handleEvent(event);
  }, []);

  const getAgentPresence = useCallback((agentId: string) => {
    return state.entries.find((e) => e.agentId === agentId);
  }, [state.entries]);

  const isOnline = useCallback((agentId: string) => {
    const entry = state.entries.find((e) => e.agentId === agentId);
    return entry?.state === 'online' || entry?.state === 'busy';
  }, [state.entries]);

  const isBusy = useCallback((agentId: string) => {
    const entry = state.entries.find((e) => e.agentId === agentId);
    return entry?.state === 'busy';
  }, [state.entries]);

  return {
    state,
    isActive,
    start,
    stop,
    handleEvent,
    getAgentPresence,
    isOnline,
    isBusy,
  };
}
