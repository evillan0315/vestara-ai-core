/**
 * AR-REPORT phase 1 — `from`/`to` parsing on GET /api/activity-room.
 *
 * Valid values normalize to ISO-8601 `since`/`until`. Unparseable values are
 * ignored (never inferred). Windows wider than 366 days clamp `to` down,
 * mirroring the MAX_LIMIT clamp on `limit`.
 */

import { describe, expect, it } from 'vitest';
import { parseActivityQuery } from '../src/routes/activity-room';

function query(params: string): ReturnType<typeof parseActivityQuery> {
  return parseActivityQuery(new URL(`http://127.0.0.1:3001/api/activity-room?${params}`));
}

describe('parseActivityQuery from/to (AR-REPORT)', () => {
  it('leaves since/until undefined when absent', () => {
    const parsed = query('');
    expect(parsed.since).toBeUndefined();
    expect(parsed.until).toBeUndefined();
  });

  it('normalizes datetime and date-only values to ISO', () => {
    const parsed = query('from=2026-10-09T12:00:00.000Z&to=2026-10-10');
    expect(parsed.since).toBe('2026-10-09T12:00:00.000Z');
    expect(parsed.until).toBe('2026-10-10T00:00:00.000Z');
  });

  it('ignores unparseable values (never inferred)', () => {
    const parsed = query('from=not-a-date&to=');
    expect(parsed.since).toBeUndefined();
    expect(parsed.until).toBeUndefined();
  });

  it('passes an inverted range through (the store matches nothing)', () => {
    const parsed = query('from=2026-10-11T00:00:00.000Z&to=2026-10-09T00:00:00.000Z');
    expect(parsed.since).toBe('2026-10-11T00:00:00.000Z');
    expect(parsed.until).toBe('2026-10-09T00:00:00.000Z');
  });

  it('clamps windows wider than 366 days', () => {
    const parsed = query('from=2020-01-01T00:00:00.000Z&to=2026-10-11T00:00:00.000Z');
    expect(parsed.since).toBe('2020-01-01T00:00:00.000Z');
    const span = new Date(parsed.until!).getTime() - new Date(parsed.since!).getTime();
    expect(span).toBe(366 * 24 * 60 * 60 * 1000);
  });

  it('keeps windows within 366 days untouched', () => {
    const parsed = query('from=2026-10-01T00:00:00.000Z&to=2026-10-11T00:00:00.000Z');
    expect(parsed.until).toBe('2026-10-11T00:00:00.000Z');
  });
});
