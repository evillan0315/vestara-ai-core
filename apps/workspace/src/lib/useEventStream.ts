import { useCallback, useEffect, useRef, useState } from 'react';
import { workspaceSocket } from './ws';
import type { WorkspaceEvent } from './ws';
import { getActivity } from './api';
import type { ActivityEvent } from './api';

export interface LiveEvent {
  id: string;
  type: string;
  category: string;
  actor: { id: string; name: string; type: string };
  resource: { type: string; id: string; name: string };
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

function isProductEvent(e: WorkspaceEvent): boolean {
  const payload = e.payload as Record<string, unknown> | undefined;
  return payload?._productEvent === true;
}

function isInfrastructureEvent(type: string): boolean {
  return type.startsWith('runtime.') || type.startsWith('runtime:') || type === 'system.heartbeat';
}

function toLiveEvent(e: WorkspaceEvent): LiveEvent | null {
  if (isInfrastructureEvent(e.type) && !isProductEvent(e)) return null;

  const data = (e.payload as Record<string, unknown>) ?? {};
  const actor = (e as any).actor;
  const resource = (e as any).resource;
  const message = (e as any).message;
  return {
    id: e.id,
    type: e.type,
    category: typeof actor === 'object' && actor !== null ? (e as any).category || 'system' : 'system',
    actor:
      typeof actor === 'object' && actor !== null
        ? { id: actor.id || 'system', name: actor.name || 'System', type: actor.type || 'system' }
        : { id: 'system', name: 'System', type: 'system' },
    resource:
      typeof resource === 'object' && resource !== null
        ? { id: resource.id || '', name: resource.name || '', type: resource.type || 'unknown' }
        : { id: '', name: '', type: 'unknown' },
    message: typeof message === 'string' ? message : e.type,
    timestamp: e.timestamp,
    metadata: data,
  };
}

function activityToLiveEvent(a: ActivityEvent): LiveEvent {
  return {
    id: a.id,
    type: a.type,
    category: a.category,
    actor: a.actor,
    resource: a.resource,
    message: a.message,
    timestamp: a.timestamp,
    metadata: a.metadata,
  };
}

const HISTORY_LIMIT = 100;

export function useEventStream() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // Fetch historical activity on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    getActivity({ limit: HISTORY_LIMIT })
      .then((historical) => {
        const mapped = historical.map(activityToLiveEvent);
        setEvents(mapped);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Subscribe to live WebSocket events
  useEffect(() => {
    const offState = workspaceSocket.onState((s) => setConnected(s === 'open'));
    const offEvent = workspaceSocket.onEvent((event) => {
      const live = toLiveEvent(event);
      if (!live) return;
      setEvents((prev) => {
        if (prev.some((e) => e.id === live.id)) return prev;
        return [live, ...prev].slice(0, 500);
      });
      setLastEvent(live);
    });
    return () => {
      offState();
      offEvent();
    };
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  const refreshHistory = useCallback(async () => {
    const historical = await getActivity({ limit: HISTORY_LIMIT });
    if (historical) {
      setEvents(historical.map(activityToLiveEvent));
    }
  }, []);

  return { connected, events, lastEvent, clearEvents, refreshHistory, loading };
}
