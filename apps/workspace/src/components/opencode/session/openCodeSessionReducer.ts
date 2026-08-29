/**
 * Deterministic session-live state reducer.
 *
 * Pure and testable independently of React. Manages the activity event list,
 * lifecycle stage progression, follow-live behavior, unseen counts, and the
 * distinction between stream status and workflow outcome.
 */

import type { OpenCodeStreamStatus } from '../../../lib/opencode-events';
import type { OpenCodeActivityEvent, OpenCodeLifecycleStage } from './openCodeEventNormalizer';
import { lifecycleStageFromStatus } from './openCodeEventNormalizer';

export type OpenCodeWorkflowOutcome = 'completed' | 'failed' | 'aborted' | 'unknown';

export type OpenCodeStageStatus = 'pending' | 'active' | 'completed' | 'failed' | 'blocked' | 'skipped';

export interface OpenCodeLifecycleStageState {
  readonly stage: OpenCodeLifecycleStage;
  readonly status: OpenCodeStageStatus;
}

export interface OpenCodeSessionLiveState {
  readonly events: readonly OpenCodeActivityEvent[];
  readonly lifecycle: readonly OpenCodeLifecycleStageState[];
  readonly streamStatus: OpenCodeStreamStatus;
  readonly followLive: boolean;
  readonly unseenEventCount: number;
  readonly lastEventAt?: string;
  /** Workflow outcome — separate from stage terminality. */
  readonly outcome: OpenCodeWorkflowOutcome;
  readonly aborted: boolean;
}

export const LIFECYCLE_ORDER: readonly OpenCodeLifecycleStage[] = [
  'request',
  'context',
  'planning',
  'execution',
  'verification',
  'complete',
];

export const INITIAL_LIFECYCLE: readonly OpenCodeLifecycleStageState[] = LIFECYCLE_ORDER.map((stage) => ({
  stage,
  status: 'pending',
}));

export const INITIAL_LIVE_STATE: OpenCodeSessionLiveState = {
  events: [],
  lifecycle: INITIAL_LIFECYCLE,
  streamStatus: 'disconnected',
  followLive: true,
  unseenEventCount: 0,
  outcome: 'unknown',
  aborted: false,
};

export type OpenCodeSessionLiveAction =
  | { readonly type: 'stream-status'; readonly status: OpenCodeStreamStatus }
  | { readonly type: 'event'; readonly event: OpenCodeActivityEvent }
  | { readonly type: 'reconcile'; readonly events: readonly OpenCodeActivityEvent[]; readonly active: boolean }
  | { readonly type: 'follow'; readonly follow: boolean }
  | { readonly type: 'jump-to-latest' }
  | { readonly type: 'abort-confirmed' }
  | { readonly type: 'reset'; readonly state?: Partial<OpenCodeSessionLiveState> };

function mergeEvents(
  existing: readonly OpenCodeActivityEvent[],
  incoming: readonly OpenCodeActivityEvent[],
): readonly OpenCodeActivityEvent[] {
  const byId = new Map<string, OpenCodeActivityEvent>();
  for (const event of [...existing, ...incoming]) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

function applyEvent(state: OpenCodeSessionLiveState, event: OpenCodeActivityEvent): OpenCodeSessionLiveState {
  // Deduplicate by id.
  if (state.events.some((existing) => existing.id === event.id)) return state;

  const events = mergeEvents(state.events, [event]);
  let lifecycle = state.lifecycle;

  if (event.kind === 'status') {
    const stage = lifecycleStageFromStatus(event.status);
    if (stage) {
      lifecycle = lifecycle.map((entry) => {
        const entryIndex = LIFECYCLE_ORDER.indexOf(entry.stage);
        const stageIndex = LIFECYCLE_ORDER.indexOf(stage);
        if (entry.stage === stage) return { ...entry, status: 'active' };
        // Stages before the current one are reached; stages after remain pending.
        if (stageIndex >= 0 && entryIndex < stageIndex && entry.status === 'pending') {
          return { ...entry, status: 'completed' };
        }
        return entry;
      });
    }
  }

  const lastEventAt = event.timestamp;
  const unseenEventCount = state.followLive ? 0 : state.unseenEventCount + 1;

  return { ...state, events, lifecycle, lastEventAt, unseenEventCount };
}

/** Mark a workflow outcome without manufacturing success from the final stage. */
function applyOutcome(state: OpenCodeSessionLiveState): OpenCodeSessionLiveState {
  if (state.aborted) return { ...state, outcome: 'aborted' };
  const hasError = state.events.some((event) => event.kind === 'error');
  if (hasError) return { ...state, outcome: 'failed' };
  return state;
}

export function openCodeSessionReducer(
  state: OpenCodeSessionLiveState,
  action: OpenCodeSessionLiveAction,
): OpenCodeSessionLiveState {
  switch (action.type) {
    case 'stream-status':
      return { ...state, streamStatus: action.status };
    case 'event':
      return applyOutcome(applyEvent(state, action.event));
    case 'reconcile': {
      const events = mergeEvents(state.events, action.events);
      const lifecycle = action.active
        ? state.lifecycle.map(
            (entry): OpenCodeLifecycleStageState =>
              entry.status === 'pending' && entry.stage === 'execution' ? { ...entry, status: 'active' } : entry,
          )
        : state.lifecycle;
      return { ...state, events, lifecycle };
    }
    case 'follow':
      return { ...state, followLive: action.follow, unseenEventCount: action.follow ? 0 : state.unseenEventCount };
    case 'jump-to-latest':
      return { ...state, followLive: true, unseenEventCount: 0 };
    case 'abort-confirmed':
      return applyOutcome({ ...state, aborted: true, outcome: 'aborted' });
    case 'reset':
      return { ...INITIAL_LIVE_STATE, ...action.state };
    default:
      return state;
  }
}
