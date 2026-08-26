import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchEffectiveStateResult,
  fetchWorkflowLiveStream,
  fetchWorkflowParticipants,
  fetchWorkflowReceipts,
  type EffectiveState,
} from '../lib/activity';
import type {
  ActivityStreamSnapshot,
  AuxiliarySource,
  LiveStreamItem,
  WorkflowParticipant,
  WorkflowReceipts,
} from '../pages/activity/activity-types';
import { useActivityStream } from './useActivityStream';

/** Single shared auxiliary polling cadence (AR-01: one interval, visibility-aware). */
export const AUXILIARY_POLL_INTERVAL_MS = 2000;

/**
 * The page-level Activity Room model (AR-01). Composes `useActivityStream`
 * (which keeps sole ownership of the socket, sequence recovery, optimistic
 * sends, and append-only identity) with first-class, cancellable, stateful
 * auxiliary sources: participants, live narrative, message receipts, and
 * effective state.
 *
 * Lifecycle contract:
 * - Scope change resets every source BEFORE new-scope data applies; superseded
 *   responses are dropped by a monotonic request id (race guard).
 * - A failed refresh after a successful one surfaces `stale` with the prior
 *   data, never silently-current.
 * - Polling shares one cadence and only runs while the document is visible.
 */
export interface ActivityRoomModel {
  stream: ActivityStreamSnapshot;
  participants: AuxiliarySource<readonly WorkflowParticipant[]>;
  liveStream: AuxiliarySource<readonly LiveStreamItem[]>;
  receipts: AuxiliarySource<WorkflowReceipts>;
  effectiveState: AuxiliarySource<EffectiveState>;
  retryAuxiliary: () => void;
}

/** Merge a fetch result into a source, honoring the stale-after-success rule. */
function mergeResult<T>(previous: AuxiliarySource<T>, result: { data?: T; error?: string }, active: boolean): AuxiliarySource<T> {
  if (!active) return { status: 'idle' };
  if (result.error === undefined && result.data !== undefined) {
    return { status: 'ready', data: result.data, updatedAt: Date.now() };
  }
  const error = result.error ?? 'Unknown error';
  if (previous.status === 'ready' || previous.status === 'stale') {
    return { ...previous, status: 'stale', error, updatedAt: Date.now() };
  }
  return { status: 'error', error };
}

export function useActivityRoomModel(): ActivityRoomModel {
  const stream = useActivityStream();

  const [participants, setParticipants] = useState<AuxiliarySource<readonly WorkflowParticipant[]>>({ status: 'idle' });
  const [liveStream, setLiveStream] = useState<AuxiliarySource<readonly LiveStreamItem[]>>({ status: 'idle' });
  const [receipts, setReceipts] = useState<AuxiliarySource<WorkflowReceipts>>({ status: 'idle' });
  const [effectiveState, setEffectiveState] = useState<AuxiliarySource<EffectiveState>>({ status: 'idle' });

  const requestRef = useRef(0);
  const workflowIdRef = useRef<string | undefined>(undefined);
  const scopeRef = useRef(stream.scope);

  workflowIdRef.current = stream.scope.workflowId;
  scopeRef.current = stream.scope;

  const load = useCallback(async (requestId: number) => {
    const workflowId = workflowIdRef.current;
    const scope = scopeRef.current;
    const [participantsResult, liveResult, receiptsResult, effectiveResult] = await Promise.all([
      workflowId !== undefined ? fetchWorkflowParticipants(workflowId) : Promise.resolve({ data: [] }),
      workflowId !== undefined ? fetchWorkflowLiveStream(workflowId) : Promise.resolve({ data: [] }),
      workflowId !== undefined ? fetchWorkflowReceipts(workflowId) : Promise.resolve({ data: { unreadByAgent: {} } }),
      fetchEffectiveStateResult(scope),
    ]);
    if (requestId !== requestRef.current) return;
    setParticipants((previous) => mergeResult(previous, participantsResult, workflowId !== undefined));
    setLiveStream((previous) => mergeResult(previous, liveResult, workflowId !== undefined));
    setReceipts((previous) => mergeResult(previous, receiptsResult, workflowId !== undefined));
    setEffectiveState((previous) => mergeResult(previous, effectiveResult, true));
  }, []);

  const scopeKey = `${stream.scope.workflowId ?? ''}|${stream.scope.sessionId ?? ''}`;

  // Reset-before-replacement: any scope change invalidates in-flight requests
  // and clears sources BEFORE the new scope's data can apply.
  useEffect(() => {
    const requestId = ++requestRef.current;
    if (stream.scope.workflowId === undefined) {
      setParticipants({ status: 'idle' });
      setLiveStream({ status: 'idle' });
      setReceipts({ status: 'idle' });
    } else {
      setParticipants({ status: 'loading' });
      setLiveStream({ status: 'loading' });
      setReceipts({ status: 'loading' });
    }
    setEffectiveState({ status: 'loading' });
    void load(requestId);
  }, [scopeKey, load, stream.scope.workflowId]);

  // Visibility-aware polling: one shared cadence, paused while hidden.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(requestRef.current);
    }, AUXILIARY_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const retryAuxiliary = useCallback(() => {
    void load(requestRef.current);
  }, [load]);

  return {
    stream,
    participants,
    liveStream,
    receipts,
    effectiveState,
    retryAuxiliary,
  };
}
