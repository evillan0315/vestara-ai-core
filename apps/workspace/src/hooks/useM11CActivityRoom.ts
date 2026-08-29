/**
 * M11C Activity Room Hook
 *
 * Composes the frozen M11A HTTP read API and M11B WebSocket protocol into
 * a single React hook that manages the complete Activity Room lifecycle:
 *
 *   HTTP snapshot → cursor C → WS subscribe(C) → catch-up → LIVE
 *   → disconnect → RECONNECTING → subscribe(lastSeq) → catch-up → LIVE
 *
 * Authority flow: M9 durable truth → M10 projection → M11A/M11B → this hook → UI
 *
 * No alternative Activity Room state source, polling loop, mock participant
 * system, or UI-owned workflow state is introduced.
 */

import type { AttentionEntry, ParticipantProjection, WorkflowSummary } from '@vestara/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type M11AActivityRecord,
  type M11AStreamItem,
  fetchM11AActivities,
  fetchM11ASnapshot,
} from '../lib/m11a-api';
import { type M11BClient, type M11BConnectionState, m11bClient } from '../lib/m11b-client';

// ─── Constants ───────────────────────────────────────────────

/** Initial snapshot fetch limit. */
const SNAPSHOT_LIMIT = 50;

/** History page size for scroll-up loading. */
const HISTORY_PAGE_SIZE = 50;

/** Maximum records to keep in the working set (bounded DOM). */
const MAX_WORKING_SET = 500;

/** Debounce interval for batching live arrivals. */
const LIVE_BATCH_MS = 40;

// ─── Types ───────────────────────────────────────────────────

/** UI connection state extending M11B's with local pause. */
export type M11CConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'paused' | 'error';

/** A stream item — either from M11A snapshot or live delivery. */
export interface M11CStreamItem {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly kind: string;
  readonly importance: 'primary' | 'secondary' | 'muted';
  readonly actor: { readonly type: string; readonly id: string; readonly displayName: string; readonly role?: string };
  readonly content: string;
  readonly workflowRunId?: string;
  readonly executionId?: string;
  readonly taskId?: string;
  readonly aggregated?: M11AStreamItem['aggregated'];
  /** Whether this item arrived live (for animation). */
  readonly fresh: boolean;
}

export interface M11CActivityRoom {
  /** Current connection state. */
  readonly state: M11CConnectionState;

  /** Room metadata. */
  readonly room: { readonly roomId: string; readonly name: string } | null;

  /** Authoritative cursor from M11A snapshot. */
  readonly cursor: { readonly sequenceNumber: number; readonly eventId: string; readonly timestamp: string } | null;

  /** Projection-driven participants. */
  readonly participants: readonly ParticipantProjection[];

  /** Stream items (snapshot + live). */
  readonly stream: readonly M11CStreamItem[];

  /** Workflow summary projection. */
  readonly workflowSummary: WorkflowSummary | null;

  /** Attention entries requiring human awareness. */
  readonly attention: readonly AttentionEntry[];

  /** Latest sequence number seen. */
  readonly latestSequence: number;

  /** Unread count (when scrolled up). */
  readonly unread: number;

  /** Whether history is currently loading. */
  readonly loadingHistory: boolean;

  /** Number of older records loaded beyond initial snapshot. */
  readonly olderLoaded: number;

  /** Error message, if any. */
  readonly error: string | undefined;

  /** Whether the stream is paused locally. */
  readonly paused: boolean;

  /** IDs that arrived live (for animation). */
  readonly freshIds: ReadonlySet<string>;

  /** Pause the live stream (buffer arrivals locally). */
  readonly pause: () => void;

  /** Resume from pause (flush buffered arrivals). */
  readonly resume: () => void;

  /** Load older history (scroll up). */
  readonly loadOlder: () => Promise<void>;

  /** Report viewport position (for auto-follow / unread tracking). */
  readonly reportViewport: (atBottom: boolean) => void;

  /** Clear unread count. */
  readonly clearUnread: () => void;

  /** Retry from error state. */
  readonly retry: () => void;

  /** Clear local view and re-fetch snapshot. */
  readonly clear: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────

function streamItemFromSnapshot(item: M11AStreamItem): M11CStreamItem {
  return {
    id: item.streamItemId,
    sequence: item.sequenceNumber,
    timestamp: item.timestamp,
    kind: item.kind,
    importance: item.importance,
    actor: item.actor,
    content: item.content,
    workflowRunId: item.workflowRunId,
    executionId: item.executionId,
    taskId: item.taskId,
    aggregated: item.aggregated,
    fresh: false,
  };
}

function streamItemFromLive(activity: M11AActivityRecord, fresh: boolean = true): M11CStreamItem {
  // Map M9 type to stream kind (simplified — full mapping lives in M10)
  const kindMap: Record<string, string> = {
    'workflow.started': 'activity',
    'workflow.completed': 'activity',
    'workflow.failed': 'activity',
    'workflow.cancelled': 'activity',
    'task.runnable': 'activity',
    'task.started': 'activity',
    'task.completed': 'activity',
    'task.failed': 'activity',
    'task.cancelled': 'activity',
    'agent.assigned': 'conversation',
    'agent.started': 'activity',
    'agent.progress': 'progress',
    'agent.waiting': 'activity',
    'agent.completed': 'activity',
    'agent.failed': 'activity',
    'agent.cancelled': 'activity',
    'human.message': 'conversation',
    'system.event': 'log',
  };

  // Derive importance from kind (simplified — full mapping lives in M10)
  const kind = kindMap[activity.type] ?? 'activity';
  const importance: M11CStreamItem['importance'] =
    kind === 'conversation' ? 'primary' :
    kind === 'log' || kind === 'telemetry' ? 'muted' :
    'secondary';

  return {
    id: activity.activityId,
    sequence: activity.sequenceNumber,
    timestamp: activity.timestamp,
    kind,
    importance,
    actor: {
      type: activity.actor.type,
      id: activity.actor.id,
      displayName: activity.actor.displayName,
      ...(activity.actorId ? { role: activity.actorId } : {}),
    },
    content: activity.payload?.message ?? '',
    workflowRunId: activity.workflowRunId,
    executionId: activity.executionId,
    taskId: activity.taskId,
    fresh,
  };
}

function compareBySequence(a: M11CStreamItem, b: M11CStreamItem): number {
  return a.sequence - b.sequence;
}

// ─── Hook ────────────────────────────────────────────────────

export function useM11CActivityRoom(): M11CActivityRoom {
  // ─── State ──────────────────────────────────────────────
  const [state, setState] = useState<M11CConnectionState>('connecting');
  const [room, setRoom] = useState<{ readonly roomId: string; readonly name: string } | null>(null);
  const [cursor, setCursor] = useState<M11CActivityRoom['cursor']>(null);
  const [participants, setParticipants] = useState<readonly ParticipantProjection[]>([]);
  const [stream, setStream] = useState<readonly M11CStreamItem[]>([]);
  const [workflowSummary, setWorkflowSummary] = useState<WorkflowSummary | null>(null);
  const [attention, setAttention] = useState<readonly AttentionEntry[]>([]);
  const [latestSequence, setLatestSequence] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [olderLoaded, setOlderLoaded] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  // ─── Refs ───────────────────────────────────────────────
  const latestSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const atBottomRef = useRef(true);
  const unreadRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const liveBufferRef = useRef<M11CStreamItem[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const clientRef = useRef<M11BClient>(m11bClient);

  // ─── Derived ────────────────────────────────────────────

  const bumpUnread = useCallback(() => {
    unreadRef.current += 1;
    setUnread(unreadRef.current);
  }, []);

  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    setUnread(0);
  }, []);

  /** Merge a batch of items into the stream, deduplicating by id. */
  const mergeStream = useCallback((items: readonly M11CStreamItem[]) => {
    if (items.length === 0) return;
    setStream((previous) => {
      const known = new Set(previous.map((item) => item.id));
      const additions = items.filter((item) => !known.has(item.id));
      if (additions.length === 0) return previous;
      const merged = [...previous, ...additions].sort(compareBySequence);
      // Bound the working set — drop oldest if over limit
      if (merged.length > MAX_WORKING_SET) {
        return merged.slice(merged.length - MAX_WORKING_SET);
      }
      return merged;
    });
  }, []);

  /** Update latest sequence from a batch. */
  const updateSequence = useCallback((seq: number) => {
    if (seq > latestSequenceRef.current) {
      latestSequenceRef.current = seq;
      setLatestSequence(seq);
    }
  }, []);

  // ─── Actions ────────────────────────────────────────────

  const reportViewport = useCallback(
    (atBottom: boolean) => {
      atBottomRef.current = atBottom;
      if (atBottom) clearUnread();
    },
    [clearUnread],
  );

  const pause = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    // Flush buffered live items
    const buffered = liveBufferRef.current;
    liveBufferRef.current = [];
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (buffered.length > 0) mergeStream(buffered);
    clearUnread();
  }, [mergeStream, clearUnread]);

  const loadOlder = useCallback(async () => {
    if (stream.length === 0 || loadingOlderRef.current) return;
    const oldest = Math.min(...stream.map((item) => item.sequence));
    loadingOlderRef.current = true;
    setLoadingHistory(true);
    try {
      const response = await fetchM11AActivities({ beforeSequence: oldest, limit: HISTORY_PAGE_SIZE });
      if (disposedRef.current) return;
      const older = response.records.map((record) => streamItemFromLive(record, false));
      const known = new Set(stream.map((item) => item.id));
      const uniqueOlder = older.filter((item) => !known.has(item.id));
      if (uniqueOlder.length > 0) {
        // Prepend older records (preserving sort order)
        setStream((previous) => {
          const merged = [...uniqueOlder, ...previous].sort(compareBySequence);
          if (merged.length > MAX_WORKING_SET) {
            return merged.slice(merged.length - MAX_WORKING_SET);
          }
          return merged;
        });
        setOlderLoaded((prev) => prev + uniqueOlder.length);
      }
    } catch (err) {
      if (!disposedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      }
    } finally {
      loadingOlderRef.current = false;
      setLoadingHistory(false);
    }
  }, [stream]);

  const clear = useCallback(() => {
    setStream([]);
    setLatestSequence(0);
    latestSequenceRef.current = 0;
    setUnread(0);
    unreadRef.current = 0;
    setFreshIds(new Set());
    setOlderLoaded(0);
    setError(undefined);
    liveBufferRef.current = [];
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    clear();
    setError(undefined);
    // Re-trigger snapshot fetch by disposing and re-initializing
    disposedRef.current = true;
    // Small delay to ensure dispose completes
    setTimeout(() => {
      disposedRef.current = false;
      // The main useEffect will re-run on next render
      setState('connecting');
    }, 100);
  }, [clear]);

  // ─── Live Activity Handler ──────────────────────────────

  const handleLiveActivity = useCallback(
    (activity: M11AActivityRecord, sequence: number) => {
      const item = streamItemFromLive(activity, true);

      if (pausedRef.current) {
        // Buffer while paused
        if (!liveBufferRef.current.some((existing) => existing.id === item.id)) {
          liveBufferRef.current.push(item);
        }
        bumpUnread();
        return;
      }

      if (!atBottomRef.current) bumpUnread();

      // Mark as fresh for animation
      setFreshIds((prev) => (prev.has(item.id) ? prev : new Set(prev).add(item.id)));

      // Buffer live arrivals for batch rendering
      liveBufferRef.current.push(item);
      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(() => {
          flushTimerRef.current = null;
          const buffered = liveBufferRef.current;
          liveBufferRef.current = [];
          mergeStream(buffered);
        }, LIVE_BATCH_MS);
      }

      updateSequence(sequence);
    },
    [bumpUnread, mergeStream, updateSequence],
  );

  // ─── WebSocket Lifecycle ────────────────────────────────

  useEffect(() => {
    disposedRef.current = false;
    const client = clientRef.current;

    // Register WebSocket listeners
    const offActivity = client.onActivity((activity, sequence) => {
      if (!disposedRef.current) handleLiveActivity(activity, sequence);
    });

    const offState = client.onState((wsState: M11BConnectionState) => {
      if (disposedRef.current) return;
      if (pausedRef.current) return; // Local pause overrides WS state
      setState(wsState);
    });

    const offSubscribed = client.onSubscribed((_cursor, _frontier) => {
      if (!disposedRef.current) setError(undefined);
    });

    const offCatchupComplete = client.onCatchupComplete((_cursor) => {
      // Catch-up complete — transition to LIVE
      if (!disposedRef.current) {
        setState(pausedRef.current ? 'paused' : 'live');
      }
    });

    const offResync = client.onResync((earliestAvailableSequence, _latestSequence) => {
      if (disposedRef.current) return;
      setError('Stream fell behind; resynchronizing…');
      // Re-fetch snapshot and re-subscribe
      void (async () => {
        try {
          const snapshot = await fetchM11ASnapshot();
          if (disposedRef.current) return;
          // Apply snapshot
          setRoom(snapshot.room);
          setCursor(snapshot.cursor);
          setParticipants(snapshot.participants);
          setWorkflowSummary(snapshot.workflowSummary);
          setAttention(snapshot.attention);
          const items = snapshot.stream.map(streamItemFromSnapshot);
          setStream(items);
          updateSequence(snapshot.cursor.sequenceNumber);
          // Re-subscribe from new cursor
          client.connect(snapshot.cursor.sequenceNumber);
        } catch {
          if (!disposedRef.current) setError('Resync failed. Retrying…');
        }
      })();
    });

    const offError = client.onError((_code, message) => {
      if (!disposedRef.current) setError(message);
    });

    const offHeartbeat = client.onHeartbeat(() => {
      // Heartbeat received — connection is alive
    });

    // ─── Initial Snapshot Fetch ───────────────────────────

    void (async () => {
      try {
        const snapshot = await fetchM11ASnapshot();
        if (disposedRef.current) return;

        // Apply snapshot state
        setRoom(snapshot.room);
        setCursor(snapshot.cursor);
        setParticipants(snapshot.participants);
        setWorkflowSummary(snapshot.workflowSummary);
        setAttention(snapshot.attention);

        const items = snapshot.stream.map(streamItemFromSnapshot);
        setStream(items);
        updateSequence(snapshot.cursor.sequenceNumber);

        // Subscribe via WebSocket from cursor sequence
        client.connect(snapshot.cursor.sequenceNumber);
      } catch (err) {
        if (!disposedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load Activity Room');
          setState('error');
        }
      }
    })();

    // ─── Cleanup ──────────────────────────────────────────

    return () => {
      disposedRef.current = true;
      offActivity();
      offState();
      offSubscribed();
      offCatchupComplete();
      offResync();
      offError();
      offHeartbeat();
      client.disconnect();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      liveBufferRef.current = [];
    };
  }, [handleLiveActivity, updateSequence]);

  // ─── Map connection state ──────────────────────────────

  const mappedState: M11CConnectionState = paused
    ? 'paused'
    : state === 'offline'
      ? 'offline'
      : state === 'reconnecting'
        ? 'reconnecting'
        : state === 'connecting'
          ? 'connecting'
          : error
            ? 'error'
            : 'live';

  return {
    state: mappedState,
    room,
    cursor,
    participants,
    stream,
    workflowSummary,
    attention,
    latestSequence,
    unread,
    loadingHistory,
    olderLoaded,
    error,
    paused,
    freshIds,
    pause,
    resume,
    loadOlder,
    reportViewport,
    clearUnread,
    retry,
    clear,
  };
}
