import type { ActivityRecord, ActivityStreamMessage, MessageTarget } from '@vestara/activity-room';
import { useCallback, useEffect, useRef, useState } from 'react';
import { activitySocket, fetchActivityHistory, postActivityMessage } from '../lib/activity';
import type {
  ActivityConnectionState,
  ActivityMessageInput,
  ActivityProjectionRecord,
  ActivityScope,
  ActivityStreamSnapshot,
  PendingSendState,
} from '../pages/activity/activity-types';

const INITIAL_LIMIT = 100;
/** Bounded historical window (STREAM-PERF-001: no full-history eager hydration). */
const HISTORY_WINDOW = 250;

function readScopeFromUrl(): ActivityScope {
  const params = new URLSearchParams(window.location.search);
  return {
    workflowId: params.get('workflowId') ?? undefined,
    sessionId: params.get('sessionId') ?? undefined,
  };
}

function writeScopeToUrl(scope: ActivityScope): void {
  const params = new URLSearchParams(window.location.search);
  if (scope.workflowId !== undefined) params.set('workflowId', scope.workflowId);
  else params.delete('workflowId');
  if (scope.sessionId !== undefined) params.set('sessionId', scope.sessionId);
  else params.delete('sessionId');
  const query = params.toString();
  const next = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, '', next);
}

function compareRecords(left: ActivityRecord, right: ActivityRecord): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  if (left.timestamp !== right.timestamp) return left.timestamp.localeCompare(right.timestamp);
  return left.id.localeCompare(right.id);
}

export function useActivityStream(): ActivityStreamSnapshot {
  const [records, setRecords] = useState<ActivityProjectionRecord[]>([]);
  const [latestSequence, setLatestSequence] = useState(0);
  const [socketState, setSocketState] = useState(activitySocket.getState());
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string>();
  const [unread, setUnread] = useState(0);
  // Ids that arrived live over the socket (vs. loaded history), so the stream
  // can animate them (typewriter) without replaying history on every reload.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  const latestSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const pendingRef = useRef<ActivityProjectionRecord[]>([]);
  const socketBufferRef = useRef<ActivityProjectionRecord[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const atBottomRef = useRef(true);
  const unreadRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const olderLoadedRef = useRef(0);

  const bumpUnread = useCallback(() => {
    unreadRef.current += 1;
    setUnread(unreadRef.current);
  }, []);

  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    setUnread(0);
  }, []);

  const markFresh = useCallback((id: string) => {
    setFreshIds((previous) => (previous.has(id) ? previous : new Set(previous).add(id)));
  }, []);

  const reportViewport = useCallback(
    (atBottom: boolean) => {
      atBottomRef.current = atBottom;
      if (atBottom) clearUnread();
    },
    [clearUnread],
  );

  const apply = useCallback(
    (record: ActivityProjectionRecord) => {
      setRecords((previous) => (previous.some((entry) => entry.id === record.id) ? previous : [...previous, record]));
      if (record.sequence > latestSequenceRef.current) {
        latestSequenceRef.current = record.sequence;
        setLatestSequence(record.sequence);
      }
    },
    [],
  );

  /** Replaces an optimistic (temp-id) record with the server's final record. */
  const replaceRecord = useCallback((tempId: string, record: ActivityProjectionRecord) => {
    setRecords((previous) => {
      const exists = previous.some((entry) => entry.id === record.id);
      const withoutTemp = previous.filter((entry) => entry.id !== tempId);
      if (exists) return withoutTemp;
      return [...withoutTemp, record];
    });
    if (record.sequence > latestSequenceRef.current) {
      latestSequenceRef.current = record.sequence;
      setLatestSequence(record.sequence);
    }
  }, []);

  const [sendStates, setSendStates] = useState<Record<string, PendingSendState>>({});

  const targetOf = (agentId: string): MessageTarget =>
    agentId === 'all-agents' ? { type: 'all-agents' } : { type: 'agent', agentId };

  const deliver = useCallback(
    async (tempId: string, existing: ActivityRecord) => {
      if (existing.kind !== 'agent-message') return;
      setSendStates((previous) => ({ ...previous, [tempId]: 'sending' }));
      try {
        const record = await postActivityMessage({
          content: existing.content,
          targets: [targetOf(existing.agentId)],
          workflowId: existing.workflowId,
          sessionId: existing.sessionId,
          referencedActivityIds: existing.referencedActivityIds,
          effect: existing.effect,
          correctionOf: existing.correctionOf,
          actor: { displayName: existing.actor.displayName, role: existing.actor.role },
        });
        replaceRecord(tempId, record as ActivityProjectionRecord);
        setSendStates((previous) => {
          const next = { ...previous };
          delete next[tempId];
          return next;
        });
      } catch {
        setSendStates((previous) => ({ ...previous, [tempId]: 'failed' }));
      }
    },
    [replaceRecord],
  );

  const sendMessage = useCallback(
    async (input: ActivityMessageInput) => {
      const tempId = `activity:msg:pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      const agentId = input.targets.some((target) => target.type === 'all-agents')
        ? 'all-agents'
        : (input.targets.find((target): target is { type: 'agent'; agentId: string } => target.type === 'agent')
            ?.agentId ?? 'all-agents');
      // Delivery scope (AAR-001E): a message composed in a scoped room belongs
      // to that workflow/session even when the caller omits it. Without a scope
      // the message is persisted globally — invisible in the scoped stream and
      // history, seeded with no delivery receipts, and never observed by agents.
      const workflowId = input.workflowId ?? scopeRef.current.workflowId;
      const sessionId = input.sessionId ?? scopeRef.current.sessionId;
      const displayName = input.actor?.displayName?.trim() || 'You';
      const actorRole = input.actor?.role?.trim() || undefined;
      const optimistic: ActivityProjectionRecord = {
        id: tempId,
        sequence: latestSequenceRef.current + 1,
        timestamp: new Date().toISOString(),
        actor: {
          type: 'human',
          id: displayName.toLowerCase().replace(/\s+/g, '-'),
          displayName,
          ...(actorRole ? { role: actorRole } : {}),
        },
        kind: 'agent-message',
        agentId,
        messageKind: 'message',
        content: input.content,
        workflowId,
        sessionId,
        evidenceRefs: [],
        ...(input.effect !== undefined ? { effect: input.effect } : {}),
        ...(input.correctionOf !== undefined ? { correctionOf: input.correctionOf } : {}),
        ...(input.referencedActivityIds !== undefined && input.referencedActivityIds.length > 0
          ? { referencedActivityIds: input.referencedActivityIds }
          : {}),
      };
      apply(optimistic);
      await deliver(tempId, optimistic);
    },
    [apply, deliver],
  );

  const recordsRef = useRef<ActivityProjectionRecord[]>([]);
  recordsRef.current = records;

  const retrySend = useCallback(
    (messageId: string) => {
      const existing = recordsRef.current.find((record) => record.id === messageId);
      if (!existing) return Promise.resolve();
      return deliver(messageId, existing);
    },
    [deliver],
  );

  const applyBatch = useCallback(
    (batch: readonly ActivityProjectionRecord[]) => {
      if (batch.length === 0) return;
      const sorted = [...batch].sort(compareRecords);
      setRecords((previous) => {
        const known = new Set(previous.map((entry) => entry.id));
        const additions = sorted.filter((entry) => !known.has(entry.id));
        return additions.length === 0 ? previous : [...previous, ...additions];
      });
      const last = sorted[sorted.length - 1];
      if (last.sequence > latestSequenceRef.current) {
        latestSequenceRef.current = last.sequence;
        setLatestSequence(last.sequence);
      }
    },
    [],
  );

  const applyPending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    applyBatch(pending);
  }, [applyBatch]);

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    applyPending();
    clearUnread();
  }, [applyPending, clearUnread]);

  const clear = useCallback(() => {
    setRecords([]);
    setLatestSequence(0);
    latestSequenceRef.current = 0;
    pendingRef.current = [];
    socketBufferRef.current = [];
    setFreshIds(new Set());
    olderLoadedRef.current = 0;
    setOlderLoaded(0);
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const recoverFrom = useCallback(
    async (afterSequence: number) => {
      const history = await fetchActivityHistory({ afterSequence, limit: HISTORY_WINDOW });
      if (history.error) {
        setError(history.error);
        return;
      }
      applyBatch(history.records as ActivityProjectionRecord[]);
    },
    [applyBatch],
  );

  const [scope, setScope] = useState<ActivityScope>(() => readScopeFromUrl());
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderLoaded, setOlderLoaded] = useState(0);
  const initialScopeRef = useRef(scope);
  const scopeRequestRef = useRef(0);

  /** Oldest loaded sequence — when undefined we have no history yet. */
  const oldestSequence = records.length > 0 ? Math.min(...records.map((r) => r.sequence)) : undefined;

  const loadOlder = useCallback(async () => {
    const current = recordsRef.current;
    if (current.length === 0 || loadingOlderRef.current) return;
    const oldest = Math.min(...current.map((r) => r.sequence));
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const history = await fetchActivityHistory({ ...scopeRef.current, beforeSequence: oldest, limit: HISTORY_WINDOW });
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    if (history.error) {
      setError(history.error);
      return;
    }
    const known = new Set(current.map((r) => r.id));
    const older = history.records.filter((r) => !known.has(r.id));
    if (older.length === 0) return;
    // Older history prepends (kept ascending by sequence).
    const sorted = [...older].sort(compareRecords);
    setRecords((previous) => [...sorted, ...previous]);
    // Track how many older records were requested so the timeline can widen
    // its render window upward (the default window stays viewport-bounded).
    olderLoadedRef.current += older.length;
    setOlderLoaded(olderLoadedRef.current);
  }, []);

  const applyScope = useCallback(
    (next: ActivityScope) => {
      const requestId = ++scopeRequestRef.current;
      setScope(next);
      writeScopeToUrl(next);
      setRecords([]);
      setLatestSequence(0);
      latestSequenceRef.current = 0;
      clearUnread();
      pendingRef.current = [];
      socketBufferRef.current = [];
      setFreshIds(new Set());
      olderLoadedRef.current = 0;
      setOlderLoaded(0);
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      void fetchActivityHistory({ ...next, limit: HISTORY_WINDOW }).then((history) => {
        if (requestId !== scopeRequestRef.current) return;
        if (history.error) {
          setError(history.error);
          return;
        }
        setError(undefined);
        applyBatch(history.records);
      });
    },
    [applyBatch, clearUnread],
  );

  const retry = useCallback(() => {
    applyScope(scope);
  }, [applyScope, scope]);

  useEffect(() => {
    let disposed = false;

    const handleMessage = (message: ActivityStreamMessage) => {
      if (disposed) return;
      if (message.type === 'activity.appended') {
        const activity = message.activity as ActivityProjectionRecord;
        if (pausedRef.current) {
          if (!pendingRef.current.some((record) => record.id === activity.id)) {
            pendingRef.current.push(activity);
          }
          bumpUnread();
          return;
        }
        // Unread is decided at receipt (not at delayed apply), so the debounce
        // cannot miscount records that arrive while the user is scrolled up.
        if (!atBottomRef.current) bumpUnread();
        markFresh(activity.id);
        // Buffer live arrivals and flush as a small debounced batch, so bursts
        // (tool/token ticks, large replays) coalesce into fewer React renders.
        socketBufferRef.current.push(activity);
        if (flushTimerRef.current === null) {
          flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null;
            const buffered = socketBufferRef.current;
            socketBufferRef.current = [];
            applyBatch(buffered);
          }, 40);
        }
        return;
      }
      if (message.type === 'activity.resync-required') {
        // The client fell behind the hub. Recover from the persisted store at
        // the last seen sequence, then re-subscribe from that boundary.
        setError('Stream fell behind; resynchronizing…');
        const checkpoint = latestSequenceRef.current;
        void recoverFrom(checkpoint).then(() => {
          if (disposed) return;
          activitySocket.subscribe(checkpoint);
        });
      }
    };

    const offMessage = activitySocket.onMessage(handleMessage);
    const offState = activitySocket.onState(setSocketState);

    void (async () => {
      const history = await fetchActivityHistory({ ...initialScopeRef.current, limit: INITIAL_LIMIT });
      if (disposed) return;
      if (history.error) {
        setError(history.error);
        return;
      }
      setError(undefined);
      applyBatch(history.records as ActivityProjectionRecord[]);
      const checkpoint = Math.max(latestSequenceRef.current, history.lastSequence);
      activitySocket.subscribe(checkpoint);
    })();

    return () => {
      disposed = true;
      offMessage();
      offState();
      activitySocket.disconnect();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      socketBufferRef.current = [];
    };
  }, [apply, applyBatch, recoverFrom, markFresh]);

  const state: ActivityConnectionState = paused
    ? 'paused'
    : socketState === 'offline'
      ? 'offline'
      : socketState === 'reconnecting'
        ? 'reconnecting'
        : socketState === 'connecting'
          ? 'connecting'
          : error
            ? 'error'
            : 'live';

  return {
    state,
    records,
    latestSequence,
    paused,
    error,
    sendStates,
    scope,
    unread,
    freshIds,
    pause,
    resume,
    clear,
    sendMessage,
    retrySend,
    applyScope,
    retry,
    loadOlder,
    loadingOlder,
    olderLoaded,
    oldestSequence,
    clearUnread,
    reportViewport,
  };
}
