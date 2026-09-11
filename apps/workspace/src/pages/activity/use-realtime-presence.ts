/**
 * AR-UI-E17/E18: Real-Time Presence WebSocket
 *
 * Provides real-time presence updates via WebSocket for agents
 * in the Activity Room. Builds on the existing ActivityStreamHub
 * infrastructure.
 *
 * Architecture Traceability:
 *   AR-UI-E: Realtime Events (phases 17-20)
 *   @see packages/activity-room/src/stream.ts (ActivityStreamHub)
 *   @see apps/workspace/src/lib/activity.ts (ActivitySocketClient)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceEntry, PresenceEvent, PresenceStateData } from './presence-types';

// ─── Types ─────────────────────────────────────────────────────

export interface RealtimePresenceConfig {
  /** WebSocket URL (defaults to /ws/presence) */
  readonly wsUrl?: string;

  /** Reconnect backoff base in milliseconds */
  readonly reconnectBaseMs?: number;

  /** Maximum reconnect backoff in milliseconds */
  readonly reconnectMaxMs?: number;

  /** Heartbeat interval in milliseconds */
  readonly heartbeatIntervalMs?: number;
}

export type RealtimePresenceState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface UseRealtimePresenceReturn {
  /** Current presence state */
  readonly presenceState: PresenceStateData;

  /** WebSocket connection state */
  readonly connectionState: RealtimePresenceState;

  /** Whether connected */
  readonly isConnected: boolean;

  /** Connect to WebSocket */
  readonly connect: () => void;

  /** Disconnect from WebSocket */
  readonly disconnect: () => void;

  /** Get a specific agent's presence */
  readonly getAgentPresence: (agentId: string) => PresenceEntry | undefined;

  /** Check if an agent is online */
  readonly isOnline: (agentId: string) => boolean;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<RealtimePresenceConfig> = {
  wsUrl: '/ws/presence',
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30_000,
  heartbeatIntervalMs: 5_000,
};

// ─── Hook ──────────────────────────────────────────────────────

/**
 * AR-UI-E17/E18: React hook for real-time presence via WebSocket.
 *
 * @param config - Optional WebSocket configuration
 */
export function useRealtimePresence(
  config?: RealtimePresenceConfig,
): UseRealtimePresenceReturn {
  const [presenceState, setPresenceState] = useState<PresenceStateData>({
    entries: [],
    onlineCount: 0,
    idleCount: 0,
    busyCount: 0,
    offlineCount: 0,
    totalCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  });
  const [connectionState, setConnectionState] = useState<RealtimePresenceState>('offline');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(DEFAULT_CONFIG.reconnectBaseMs);
  const configRef = useRef({ ...DEFAULT_CONFIG, ...config });
  const entriesRef = useRef<Map<string, PresenceEntry>>(new Map());

  // Update config ref
  useEffect(() => {
    configRef.current = { ...DEFAULT_CONFIG, ...config };
  }, [config]);

  // ─── WebSocket handlers ────────────────────────────────────

  const handleOpen = useCallback(() => {
    setConnectionState('live');
    backoffRef.current = configRef.current.reconnectBaseMs;

    // Start heartbeat
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'presence-heartbeat' }));
      }
    }, configRef.current.heartbeatIntervalMs);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'presence-update') {
        const entry = data.payload as PresenceEntry;
        entriesRef.current.set(entry.agentId, entry);
        updatePresenceState();
      } else if (data.type === 'presence-bulk') {
        const entries = data.payload as PresenceEntry[];
        for (const entry of entries) {
          entriesRef.current.set(entry.agentId, entry);
        }
        updatePresenceState();
      } else if (data.type === 'presence-remove') {
        const { agentId } = data.payload as { agentId: string };
        entriesRef.current.delete(agentId);
        updatePresenceState();
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleClose = useCallback(() => {
    setConnectionState('reconnecting');
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    // Exponential backoff reconnect
    reconnectTimerRef.current = setTimeout(() => {
      backoffRef.current = Math.min(
        configRef.current.reconnectMaxMs,
        backoffRef.current * 2,
      );
      connect();
    }, backoffRef.current);
  }, []);

  const handleError = useCallback(() => {
    setConnectionState('offline');
  }, []);

  // ─── Presence state update ─────────────────────────────────

  const updatePresenceState = useCallback(() => {
    const entries = Array.from(entriesRef.current.values());
    const now = new Date().toISOString();

    setPresenceState({
      entries,
      onlineCount: entries.filter((e) => e.state === 'online').length,
      idleCount: entries.filter((e) => e.state === 'idle').length,
      busyCount: entries.filter((e) => e.state === 'busy').length,
      offlineCount: entries.filter((e) => e.state === 'offline' || e.state === 'away').length,
      totalCount: entries.length,
      lastUpdatedAt: now,
    });
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
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
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

  const getAgentPresence = useCallback((agentId: string) => {
    return entriesRef.current.get(agentId);
  }, []);

  const isOnline = useCallback((agentId: string) => {
    const entry = entriesRef.current.get(agentId);
    return entry?.state === 'online' || entry?.state === 'busy';
  }, []);

  return {
    presenceState,
    connectionState,
    isConnected: connectionState === 'live',
    connect,
    disconnect,
    getAgentPresence,
    isOnline,
  };
}
