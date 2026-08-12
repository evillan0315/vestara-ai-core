import type { ActivityRecord, ActivityStreamMessage, MessageTarget } from '@vestara/activity-projection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { activitySocket, fetchActivityHistory, postActivityMessage } from '../lib/activity';
import type {
  ActivityConnectionState,
  ActivityMessageInput,
  ActivityScope,
  ActivityStreamSnapshot,
  PendingSendState,
} from '../pages/activity/activity-types';

const INITIAL_LIMIT = 100;

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
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [latestSequence, setLatestSequence] = useState(0);
  const [socketState, setSocketState] = useState(activitySocket.getState());
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string>();
  const [unread, setUnread] = useState(0);

  const latestSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const pendingRef = useRef<ActivityRecord[]>([]);
  const atBottomRef = useRef(true);
  const unreadRef = useRef(0);

  const bumpUnread = useCallback(() => {
    unreadRef.current += 1;
    setUnread(unreadRef.current);
  }, []);

  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    setUnread(0);
  }, []);

  const reportViewport = useCallback(
    (atBottom: boolean) => {
      atBottomRef.current = atBottom;
      if (atBottom) clearUnread();
    },
    [clearUnread],
  );

  const apply = useCallback(
    (record: ActivityRecord) => {
      setRecords((previous) => (previous.some((entry) => entry.id === record.id) ? previous : [...previous, record]));
      if (record.sequence > latestSequenceRef.current) {
        latestSequenceRef.current = record.sequence;
        setLatestSequence(record.sequence);
      }
      if (!atBottomRef.current) bumpUnread();
    },
    [bumpUnread],
  );

  /** Replaces an optimistic (temp-id) record with the server's final record. */
  const replaceRecord = useCallback((tempId: string, record: ActivityRecord) => {
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
        replaceRecord(tempId, record);
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
      const displayName = input.actor?.displayName?.trim() || 'You';
      const actorRole = input.actor?.role?.trim() || undefined;
      const optimistic: ActivityRecord = {
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
        workflowId: input.workflowId,
        sessionId: input.sessionId,
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

  const recordsRef = useRef<ActivityRecord[]>([]);
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
    (batch: readonly ActivityRecord[]) => {
      const sorted = [...batch].sort(compareRecords);
      for (const record of sorted) apply(record);
    },
    [apply],
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
  }, []);

  const recoverFrom = useCallback(
    async (afterSequence: number) => {
      const history = await fetchActivityHistory({ afterSequence, limit: 1000 });
      applyBatch(history.records);
    },
    [applyBatch],
  );

  const [scope, setScope] = useState<ActivityScope>(() => readScopeFromUrl());
  const initialScopeRef = useRef(scope);

  const applyScope = useCallback(
    (next: ActivityScope) => {
      setScope(next);
      writeScopeToUrl(next);
      void fetchActivityHistory({ ...next, limit: 1000 }).then((history) => applyBatch(history.records));
    },
    [applyBatch],
  );

  useEffect(() => {
    let disposed = false;

    const handleMessage = (message: ActivityStreamMessage) => {
      if (disposed) return;
      if (message.type === 'activity.appended') {
        if (pausedRef.current) {
          if (!pendingRef.current.some((record) => record.id === message.activity.id)) {
            pendingRef.current.push(message.activity);
          }
          bumpUnread();
          return;
        }
        apply(message.activity);
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
      applyBatch(history.records);
      const checkpoint = Math.max(latestSequenceRef.current, history.lastSequence);
      activitySocket.subscribe(checkpoint);
    })();

    return () => {
      disposed = true;
      offMessage();
      offState();
      activitySocket.disconnect();
    };
  }, [apply, applyBatch, recoverFrom]);

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
    pause,
    resume,
    clear,
    sendMessage,
    retrySend,
    applyScope,
    clearUnread,
    reportViewport,
  };
}
