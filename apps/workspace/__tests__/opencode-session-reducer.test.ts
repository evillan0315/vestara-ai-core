import { describe, expect, it } from 'vitest';
import type { OpenCodeActivityEvent } from '../src/components/opencode/session/openCodeEventNormalizer';
import {
  INITIAL_LIVE_STATE,
  type OpenCodeSessionLiveState,
  openCodeSessionReducer,
} from '../src/components/opencode/session/openCodeSessionReducer';

function event(id: string, timestamp: string, kind: OpenCodeActivityEvent['kind'] = 'system'): OpenCodeActivityEvent {
  return {
    id,
    type: 'opencode.system',
    kind,
    timestamp,
    sessionId: 'ses_1',
    summary: kind === 'system' ? 'summary' : undefined,
    message: kind === 'error' ? 'boom' : undefined,
    status: kind === 'status' ? 'running' : undefined,
  } as OpenCodeActivityEvent;
}

function statusEvent(id: string, timestamp: string, status: string): OpenCodeActivityEvent {
  return {
    id,
    type: 'opencode.session.status',
    kind: 'status',
    timestamp,
    sessionId: 'ses_1',
    status,
  } as OpenCodeActivityEvent;
}

function errorEvent(id: string, timestamp: string): OpenCodeActivityEvent {
  return {
    id,
    type: 'opencode.session.error',
    kind: 'error',
    timestamp,
    sessionId: 'ses_1',
    message: 'boom',
  } as OpenCodeActivityEvent;
}

describe('openCodeSessionReducer', () => {
  it('orders events chronologically regardless of arrival order', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, { type: 'event', event: event('b', '2026-08-05T00:00:02Z') });
    state = openCodeSessionReducer(state, { type: 'event', event: event('a', '2026-08-05T00:00:01Z') });
    expect(state.events.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('deduplicates repeated event ids', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, { type: 'event', event: event('dup', '2026-08-05T00:00:01Z') });
    state = openCodeSessionReducer(state, { type: 'event', event: event('dup', '2026-08-05T00:00:01Z') });
    expect(state.events).toHaveLength(1);
  });

  it('updates lifecycle stages from recognized status events', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, {
      type: 'event',
      event: statusEvent('s1', '2026-08-05T00:00:01Z', 'planning'),
    });
    state = openCodeSessionReducer(state, {
      type: 'event',
      event: statusEvent('s2', '2026-08-05T00:00:02Z', 'executing'),
    });
    const execution = state.lifecycle.find((entry) => entry.stage === 'execution');
    expect(execution?.status).toBe('active');
    const planning = state.lifecycle.find((entry) => entry.stage === 'planning');
    expect(planning?.status).toBe('active');
  });

  it('does not mark a failed workflow as successful completion', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, {
      type: 'event',
      event: statusEvent('s1', '2026-08-05T00:00:01Z', 'executing'),
    });
    state = openCodeSessionReducer(state, { type: 'event', event: errorEvent('e1', '2026-08-05T00:00:02Z') });
    state = openCodeSessionReducer(state, {
      type: 'event',
      event: statusEvent('s2', '2026-08-05T00:00:03Z', 'completed'),
    });
    expect(state.outcome).toBe('failed');
    expect(state.aborted).toBe(false);
  });

  it('marks aborted outcome without manufacturing success', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, {
      type: 'event',
      event: statusEvent('s1', '2026-08-05T00:00:01Z', 'running'),
    });
    state = openCodeSessionReducer(state, { type: 'abort-confirmed' });
    expect(state.outcome).toBe('aborted');
    expect(state.aborted).toBe(true);
  });

  it('increments unseen count when follow-live is paused', () => {
    let state = openCodeSessionReducer(INITIAL_LIVE_STATE, { type: 'follow', follow: false });
    state = openCodeSessionReducer(state, { type: 'event', event: event('a', '2026-08-05T00:00:01Z') });
    state = openCodeSessionReducer(state, { type: 'event', event: event('b', '2026-08-05T00:00:02Z') });
    expect(state.unseenEventCount).toBe(2);
    expect(state.followLive).toBe(false);
  });

  it('resets unseen count and re-enables following on jump-to-latest', () => {
    let state = openCodeSessionReducer(INITIAL_LIVE_STATE, { type: 'follow', follow: false });
    state = openCodeSessionReducer(state, { type: 'event', event: event('a', '2026-08-05T00:00:01Z') });
    state = openCodeSessionReducer(state, { type: 'jump-to-latest' });
    expect(state.followLive).toBe(true);
    expect(state.unseenEventCount).toBe(0);
  });

  it('preserves unknown events', () => {
    let state = INITIAL_LIVE_STATE;
    const unknown = {
      id: 'u1',
      type: 'opencode.weird',
      kind: 'unknown' as const,
      rawType: 'weird',
      timestamp: '2026-08-05T00:00:01Z',
    };
    state = openCodeSessionReducer(state, { type: 'event', event: unknown });
    expect(state.events).toHaveLength(1);
    expect(state.events[0].kind).toBe('unknown');
  });

  it('marks stream errors separately from execution errors', () => {
    let state = openCodeSessionReducer(INITIAL_LIVE_STATE, { type: 'stream-status', status: 'reconnecting' });
    expect(state.streamStatus).toBe('reconnecting');
    expect(state.outcome).toBe('unknown');
    state = openCodeSessionReducer(state, { type: 'event', event: errorEvent('e1', '2026-08-05T00:00:01Z') });
    expect(state.outcome).toBe('failed');
    expect(state.streamStatus).toBe('reconnecting');
  });

  it('reconciles REST events and merges with existing state', () => {
    let state = INITIAL_LIVE_STATE;
    state = openCodeSessionReducer(state, { type: 'event', event: event('live', '2026-08-05T00:00:02Z') });
    state = openCodeSessionReducer(state, {
      type: 'reconcile',
      events: [event('rest1', '2026-08-05T00:00:01Z'), event('live', '2026-08-05T00:00:02Z')],
      active: true,
    });
    expect(state.events.map((e) => e.id)).toEqual(['rest1', 'live']);
    expect(state.events).toHaveLength(2);
  });
});
