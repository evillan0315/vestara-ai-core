/**
 * AR-UI-E20: Real-Time Execution State WebSocket
 *
 * Provides real-time execution state updates via WebSocket for agents
 * in the Activity Room. Tracks task progress, completion, and failures.
 *
 * Architecture Traceability:
 *   AR-UI-E: Realtime Events (phases 17-20)
 *   @see packages/activity-room/src/stream.ts (ActivityStreamHub)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface ExecutionStateEvent {
  /** Event type */
  readonly type: 'execution-start' | 'execution-progress' | 'execution-complete' | 'execution-fail';

  /** Agent ID */
  readonly agentId: string;

  /** Execution ID */
  readonly executionId: string;

  /** Task description */
  readonly task: string;

  /** Progress percentage (0-100) */
  readonly progress?: number;

  /** Result summary (on complete) */
  readonly result?: string;

  /** Error message (on fail) */
  readonly error?: string;

  /** Timestamp */
  readonly timestamp: string;
}

export interface ExecutionStateEntry {
  /** Execution ID */
  readonly id: string;

  /** Agent ID */
  readonly agentId: string;

  /** Task description */
  readonly task: string;

  /** Current status */
  readonly status: 'running' | 'completed' | 'failed';

  /** Progress percentage (0-100) */
  readonly progress: number;

  /** Start time */
  readonly startedAt: string;

  /** End time (if completed/failed) */
  readonly completedAt?: string;

  /** Result summary */
  readonly result?: string;

  /** Error message */
  readonly error?: string;
}

export interface ExecutionState {
  /** All active executions */
  readonly active: readonly ExecutionStateEntry[];

  /** Recent completions (last 10) */
  readonly recent: readonly ExecutionStateEntry[];

  /** Total active count */
  readonly activeCount: number;
}

export interface UseRealtimeExecutionConfig {
  /** WebSocket URL (defaults to /ws/execution) */
  readonly wsUrl?: string;

  /** Maximum recent completions to keep */
  readonly maxRecent?: number;
}

export interface UseRealtimeExecutionReturn {
  /** Current execution state */
  readonly executionState: ExecutionState;

  /** Connection state */
  readonly connectionState: 'connecting' | 'live' | 'reconnecting' | 'offline';

  /** Whether connected */
  readonly isConnected: boolean;

  /** Connect to WebSocket */
  readonly connect: () => void;

  /** Disconnect from WebSocket */
  readonly disconnect: () => void;

  /** Get executions for a specific agent */
  readonly getAgentExecutions: (agentId: string) => readonly ExecutionStateEntry[];

  /** Check if an agent has active work */
  readonly hasActiveWork: (agentId: string) => boolean;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<UseRealtimeExecutionConfig> = {
  wsUrl: '/ws/execution',
  maxRecent: 10,
};

// ─── Hook ──────────────────────────────────────────────────────

/**
 * AR-UI-E20: React hook for real-time execution state via WebSocket.
 *
 * @param config - Optional WebSocket configuration
 */
export function useRealtimeExecution(
  config?: UseRealtimeExecutionConfig,
): UseRealtimeExecutionReturn {
  const [executionState, setExecutionState] = useState<ExecutionState>({
    active: [],
    recent: [],
    activeCount: 0,
  });
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('offline');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const configRef = useRef({ ...DEFAULT_CONFIG, ...config });
  const activeRef = useRef<Map<string, ExecutionStateEntry>>(new Map());
  const recentRef = useRef<ExecutionStateEntry[]>([]);

  // Update config ref
  useEffect(() => {
    configRef.current = { ...DEFAULT_CONFIG, ...config };
  }, [config]);

  // ─── Update state ──────────────────────────────────────────

  const updateState = useCallback(() => {
    const active = Array.from(activeRef.current.values());
    const recent = recentRef.current.slice(0, configRef.current.maxRecent);

    setExecutionState({
      active,
      recent,
      activeCount: active.length,
    });
  }, []);

  // ─── WebSocket handlers ────────────────────────────────────

  const handleOpen = useCallback(() => {
    setConnectionState('live');
    backoffRef.current = 1000;
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'execution-update') {
        const evt = data.payload as ExecutionStateEvent;

        switch (evt.type) {
          case 'execution-start': {
            const entry: ExecutionStateEntry = {
              id: evt.executionId,
              agentId: evt.agentId,
              task: evt.task,
              status: 'running',
              progress: 0,
              startedAt: evt.timestamp,
            };
            activeRef.current.set(evt.executionId, entry);
            break;
          }

          case 'execution-progress': {
            const existing = activeRef.current.get(evt.executionId);
            if (existing) {
              activeRef.current.set(evt.executionId, {
                ...existing,
                progress: evt.progress ?? existing.progress,
              });
            }
            break;
          }

          case 'execution-complete': {
            const completed = activeRef.current.get(evt.executionId);
            if (completed) {
              const entry: ExecutionStateEntry = {
                ...completed,
                status: 'completed',
                progress: 100,
                completedAt: evt.timestamp,
                result: evt.result,
              };
              activeRef.current.delete(evt.executionId);
              recentRef.current.unshift(entry);
              // Keep only recent completions
              if (recentRef.current.length > configRef.current.maxRecent) {
                recentRef.current = recentRef.current.slice(0, configRef.current.maxRecent);
              }
            }
            break;
          }

          case 'execution-fail': {
            const failed = activeRef.current.get(evt.executionId);
            if (failed) {
              const entry: ExecutionStateEntry = {
                ...failed,
                status: 'failed',
                completedAt: evt.timestamp,
                error: evt.error,
              };
              activeRef.current.delete(evt.executionId);
              recentRef.current.unshift(entry);
              if (recentRef.current.length > configRef.current.maxRecent) {
                recentRef.current = recentRef.current.slice(0, configRef.current.maxRecent);
              }
            }
            break;
          }
        }

        updateState();
      }
    } catch {
      // Ignore parse errors
    }
  }, [updateState]);

  const handleClose = useCallback(() => {
    setConnectionState('reconnecting');

    reconnectTimerRef.current = setTimeout(() => {
      backoffRef.current = Math.min(30_000, backoffRef.current * 2);
      connect();
    }, backoffRef.current);
  }, []);

  const handleError = useCallback(() => {
    setConnectionState('offline');
  }, []);

  // ─── Connect/disconnect ────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('connecting');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}${configRef.current.wsUrl}`;

      const ws = new WebSocket(url);
      ws.onopen = handleOpen;
      ws.onmessage = handleMessage;
      ws.onclose = handleClose;
      ws.onerror = handleError;

      wsRef.current = ws;
    } catch {
      setConnectionState('offline');
    }
  }, [handleOpen, handleMessage, handleClose, handleError]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('offline');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // ─── Derived state ─────────────────────────────────────────

  const getAgentExecutions = useCallback((agentId: string) => {
    const all = [...activeRef.current.values(), ...recentRef.current];
    return all.filter((e) => e.agentId === agentId);
  }, []);

  const hasActiveWork = useCallback((agentId: string) => {
    return Array.from(activeRef.current.values()).some((e) => e.agentId === agentId);
  }, []);

  return {
    executionState,
    connectionState,
    isConnected: connectionState === 'live',
    connect,
    disconnect,
    getAgentExecutions,
    hasActiveWork,
  };
}
