/**
 * AR-UI-E: Unified Real-Time Events Hook
 *
 * Combines real-time presence and execution state updates into
 * a single hook for Activity Room components.
 *
 * Architecture Traceability:
 *   AR-UI-E: Realtime Events (phases 17-20)
 *   @see use-realtime-presence.ts
 *   @see use-realtime-execution.ts
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useState } from 'react';
import type { PresenceStateData, PresenceEntry } from './presence-types';
import type { ExecutionState, ExecutionStateEntry } from './use-realtime-execution';
import { useRealtimePresence, type RealtimePresenceState } from './use-realtime-presence';
import { useRealtimeExecution } from './use-realtime-execution';

// ─── Types ─────────────────────────────────────────────────────

export interface UseRealtimeEventsConfig {
  /** Whether to auto-connect on mount */
  readonly autoConnect?: boolean;

  /** Presence WebSocket URL */
  readonly presenceWsUrl?: string;

  /** Execution WebSocket URL */
  readonly executionWsUrl?: string;
}

export interface UseRealtimeEventsReturn {
  /** Presence state */
  readonly presence: PresenceStateData;

  /** Execution state */
  readonly execution: ExecutionState;

  /** Combined connection state */
  readonly connectionState: 'connecting' | 'live' | 'reconnecting' | 'offline';

  /** Whether both connections are live */
  readonly isConnected: boolean;

  /** Connect both WebSockets */
  readonly connect: () => void;

  /** Disconnect both WebSockets */
  readonly disconnect: () => void;

  /** Get all data for a specific agent */
  readonly getAgentData: (agentId: string) => AgentRealtimeData;

  /** Check if an agent is online */
  readonly isOnline: (agentId: string) => boolean;

  /** Check if an agent has active work */
  readonly hasActiveWork: (agentId: string) => boolean;
}

export interface AgentRealtimeData {
  /** Agent presence */
  readonly presence?: PresenceEntry;

  /** Agent executions */
  readonly executions: readonly ExecutionStateEntry[];

  /** Whether agent is online */
  readonly isOnline: boolean;

  /** Whether agent has active work */
  readonly hasActiveWork: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────

/**
 * AR-UI-E: React hook for unified real-time events.
 *
 * Combines presence and execution state from separate WebSocket
 * connections into a single interface for Activity Room components.
 *
 * @param config - Optional configuration
 */
export function useRealtimeEvents(
  config?: UseRealtimeEventsConfig,
): UseRealtimeEventsReturn {
  const presence = useRealtimePresence({
    wsUrl: config?.presenceWsUrl,
  });

  const execution = useRealtimeExecution({
    wsUrl: config?.executionWsUrl,
  });

  // Auto-connect on mount
  useEffect(() => {
    if (config?.autoConnect !== false) {
      presence.connect();
      execution.connect();
    }
  }, [config?.autoConnect, presence.connect, execution.connect]);

  // Derive combined connection state
  const connectionState = useCallback((): 'connecting' | 'live' | 'reconnecting' | 'offline' => {
    const pState = presence.connectionState;
    const eState = execution.connectionState;

    if (pState === 'live' && eState === 'live') return 'live';
    if (pState === 'connecting' || eState === 'connecting') return 'connecting';
    if (pState === 'reconnecting' || eState === 'reconnecting') return 'reconnecting';
    return 'offline';
  }, [presence.connectionState, execution.connectionState]);

  const isConnected = presence.isConnected && execution.isConnected;

  // Connect both
  const connect = useCallback(() => {
    presence.connect();
    execution.connect();
  }, [presence.connect, execution.connect]);

  // Disconnect both
  const disconnect = useCallback(() => {
    presence.disconnect();
    execution.disconnect();
  }, [presence.disconnect, execution.disconnect]);

  // Get all data for a specific agent
  const getAgentData = useCallback((agentId: string): AgentRealtimeData => {
    const presenceEntry = presence.getAgentPresence(agentId);
    const executions = execution.getAgentExecutions(agentId);
    const isOnline = presence.isOnline(agentId);
    const hasActiveWork = execution.hasActiveWork(agentId);

    return {
      presence: presenceEntry,
      executions,
      isOnline,
      hasActiveWork,
    };
  }, [presence, execution]);

  return {
    presence: presence.presenceState,
    execution: execution.executionState,
    connectionState: connectionState(),
    isConnected,
    connect,
    disconnect,
    getAgentData,
    isOnline: presence.isOnline,
    hasActiveWork: execution.hasActiveWork,
  };
}
