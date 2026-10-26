import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_DATA_STATUS_CONFIG,
  CONNECTION_STATUS_CONFIG,
  LIVE_STREAM_RECONNECT_LABEL,
  LIVE_STREAM_STATUS_PREFIX,
  STALE_WORK_MS,
  activityDataStatus,
  isWorkStateStale,
} from './status-config';

describe('Activity Room degraded status contract', () => {
  it('keeps connected M11B and available M11A data distinct and truthful', () => {
    expect(CONNECTION_STATUS_CONFIG.live.label).toBe('Live');
    expect(activityDataStatus(true, true)).toBe('available');
    expect(ACTIVITY_DATA_STATUS_CONFIG.available.label).toBe('Available');
  });

  it('presents disconnected M11B with available M11A data as usable degraded operation', () => {
    expect(CONNECTION_STATUS_CONFIG.offline.label).toBe('Disconnected');
    expect(activityDataStatus(true, true)).toBe('available');
    expect(ACTIVITY_DATA_STATUS_CONFIG.available.label).not.toMatch(/unavailable/i);
  });

  it('keeps live disconnect separate from incomplete snapshot completeness', () => {
    expect(CONNECTION_STATUS_CONFIG.offline.label).toBe('Disconnected');
    expect(activityDataStatus(true, false)).toBe('incomplete');
    expect(ACTIVITY_DATA_STATUS_CONFIG.incomplete.label).toContain('snapshot incomplete');
  });

  it('preserves existing activity data while M11B is reconnecting', () => {
    expect(CONNECTION_STATUS_CONFIG.reconnecting.label).toBe('Reconnecting');
    expect(activityDataStatus(true, true)).toBe('available');
  });

  it('does not turn generic data freshness into live transport state', () => {
    expect(CONNECTION_STATUS_CONFIG.offline.label).not.toBe('Live');
    expect(CONNECTION_STATUS_CONFIG.offline.label).toBe('Disconnected');
  });

  it('names reconnect as an M11B live-stream action', () => {
    expect(LIVE_STREAM_RECONNECT_LABEL).toBe('Reconnect live stream');
  });

  it('scopes disconnected presentation to live updates rather than the Activity Room', () => {
    const presentation = `${LIVE_STREAM_STATUS_PREFIX} · ${CONNECTION_STATUS_CONFIG.offline.label}`;

    expect(presentation).toBe('Live updates · Disconnected');
    expect(presentation).not.toMatch(/activity room.*disconnected/i);
    expect(ACTIVITY_DATA_STATUS_CONFIG.available.label).toBe('Available');
  });

  it.each(['connecting', 'live', 'reconnecting'] as const)('keeps %s scoped and truthful', (state) => {
    const presentation = `${LIVE_STREAM_STATUS_PREFIX} · ${CONNECTION_STATUS_CONFIG[state].label}`;

    expect(presentation.startsWith('Live updates · ')).toBe(true);
    expect(presentation).not.toMatch(/activity room.*disconnected/i);
  });

  it('retains unavailable as a separate M11A data condition', () => {
    expect(activityDataStatus(false, true)).toBe('unavailable');
    expect(ACTIVITY_DATA_STATUS_CONFIG.unavailable.label).toBe('Unavailable');
  });
});

describe('Stale work detection (presentation only)', () => {
  const now = new Date('2026-10-27T04:30:00.000Z').getTime();

  it('flags working with no activity beyond the threshold', () => {
    const old = new Date(now - STALE_WORK_MS - 1).toISOString();
    expect(isWorkStateStale('working', old, now)).toBe(true);
    expect(isWorkStateStale('building', old, now)).toBe(true);
  });

  it('keeps fresh working claims unflagged', () => {
    const fresh = new Date(now - STALE_WORK_MS + 1).toISOString();
    expect(isWorkStateStale('working', fresh, now)).toBe(false);
  });

  it('never flags non-active states, however old', () => {
    const old = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    for (const state of ['available', 'idle', 'waiting', 'blocked', 'attention-required']) {
      expect(isWorkStateStale(state, old, now)).toBe(false);
    }
  });

  it('never claims on missing or unparseable timestamps', () => {
    expect(isWorkStateStale('working', undefined, now)).toBe(false);
    expect(isWorkStateStale('working', '', now)).toBe(false);
    expect(isWorkStateStale('working', 'not-a-date', now)).toBe(false);
  });
});
