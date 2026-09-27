/** @vitest-environment jsdom */

/**
 * AR-DATE-001-03 — date-window filter logic.
 *
 * Proves the date predicate at the stream layer:
 * - absent/empty/malformed bounds apply no predicate;
 * - single-day and From/To windows are inclusive calendar days (viewer locale);
 * - invalid ranges (`From > To`) apply no predicate (the UI warns separately);
 * - unparseable timestamps are excluded only while a window is active;
 * - date composes with participant + category + search (AND, never lossy).
 */

import { describe, expect, it } from 'vitest';
import {
  filterStreamItems,
  isValidDateRange,
  matchesDateWindow,
  parseCalendarDay,
  type StreamFilterOptions,
} from './M11CActivityStream';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

const BASE: StreamFilterOptions = {
  density: 'raw',
  activeFilter: 'all',
  typeFilter: 'all',
  searchQuery: '',
};

function item(
  id: string,
  timestamp: string,
  overrides?: Partial<M11CStreamItem>,
): M11CStreamItem {
  return {
    id,
    sequence: 1,
    timestamp,
    kind: 'conversation',
    importance: 'primary',
    actor: { type: 'human', id: 'marionette', displayName: 'Marionette Evangelista' },
    content: 'hello',
    fresh: false,
    ...overrides,
  };
}

/** Local noon avoids viewer-timezone edge drift in fixtures. */
function localNoon(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

describe('AR-DATE-001 date-window predicate', () => {
  it('applies no predicate when bounds are absent, empty, or malformed', () => {
    const items = [item('a', localNoon(2026, 9, 26))];
    expect(filterStreamItems(items, BASE)).toHaveLength(1);
    expect(filterStreamItems(items, { ...BASE, startDate: '', endDate: '' })).toHaveLength(1);
    expect(filterStreamItems(items, { ...BASE, startDate: 'not-a-date' })).toHaveLength(1);
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-13-40' })).toHaveLength(1);
    expect(parseCalendarDay('2026-02-30')).toBeNull();
  });

  it('keeps only the selected single day (inclusive boundaries)', () => {
    const items = [
      item('d25', localNoon(2026, 9, 25)),
      item('d26', localNoon(2026, 9, 26)),
      item('d27', localNoon(2026, 9, 27)),
    ];
    const only26 = filterStreamItems(items, { ...BASE, startDate: '2026-09-26', endDate: '2026-09-26' });
    expect(only26.map((i) => i.id)).toEqual(['d26']);
  });

  it('supports half-bounded From-only and To-only windows', () => {
    const items = [
      item('d25', localNoon(2026, 9, 25)),
      item('d26', localNoon(2026, 9, 26)),
      item('d27', localNoon(2026, 9, 27)),
    ];
    expect(
      filterStreamItems(items, { ...BASE, startDate: '2026-09-26' }).map((i) => i.id),
    ).toEqual(['d26', 'd27']);
    expect(
      filterStreamItems(items, { ...BASE, endDate: '2026-09-26' }).map((i) => i.id),
    ).toEqual(['d25', 'd26']);
  });

  it('treats local-midnight start as inclusive and next midnight as exclusive', () => {
    const start = new Date(2026, 8, 26, 0, 0, 0).toISOString();
    const end = new Date(2026, 8, 27, 0, 0, 0).toISOString();
    expect(matchesDateWindow(start, '2026-09-26', '2026-09-26')).toBe(true);
    expect(matchesDateWindow(end, '2026-09-26', '2026-09-26')).toBe(false);
  });

  it('applies no predicate on invalid ranges and reports them invalid', () => {
    const items = [item('a', localNoon(2026, 9, 26)), item('b', localNoon(2026, 9, 27))];
    expect(isValidDateRange('2026-09-27', '2026-09-26')).toBe(false);
    expect(isValidDateRange('2026-09-26', '2026-09-27')).toBe(true);
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-09-27', endDate: '2026-09-26' })).toHaveLength(2);
  });

  it('excludes unparseable timestamps only while a window is active', () => {
    const items = [item('bad', 'not-a-timestamp')];
    expect(filterStreamItems(items, BASE)).toHaveLength(1);
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-09-26' })).toHaveLength(0);
  });

  it('composes with participant, category, and search (AND)', () => {
    const items = [
      item('m26', localNoon(2026, 9, 26)),
      item('m27', localNoon(2026, 9, 27)),
      item('other', localNoon(2026, 9, 26), {
        actor: { type: 'human', id: 'other', displayName: 'Someone Else' },
      }),
      item('work', localNoon(2026, 9, 26), {
        kind: 'activity',
        content: 'ran tests',
        actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
      }),
    ];
    const windowed = { ...BASE, startDate: '2026-09-26', endDate: '2026-09-27' };
    expect(filterStreamItems(items, windowed)).toHaveLength(4);
    expect(
      filterStreamItems(items, { ...windowed, selectedParticipantId: 'marionette' }).map((i) => i.id),
    ).toEqual(['m26', 'm27']);
    expect(
      filterStreamItems(items, { ...windowed, typeFilter: 'conversations' }).map((i) => i.id),
    ).toEqual(['m26', 'm27', 'other']);
    expect(
      filterStreamItems(items, { ...windowed, searchQuery: 'marionette' }).map((i) => i.id),
    ).toEqual(['m26', 'm27']);
  });

  it('isolates the Marionette yesterday/today shape (23 + 2)', () => {
    const items: M11CStreamItem[] = [];
    for (let i = 0; i < 23; i += 1) {
      items.push(item(`sep26-${i}`, new Date(2026, 8, 26, 11, 40 + i, 0).toISOString()));
    }
    items.push(item('sep27-a', new Date(2026, 8, 27, 14, 23, 6).toISOString()));
    items.push(item('sep27-b', new Date(2026, 8, 27, 14, 23, 44).toISOString()));
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-09-26', endDate: '2026-09-27' })).toHaveLength(25);
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-09-27', endDate: '2026-09-27' })).toHaveLength(2);
    expect(filterStreamItems(items, { ...BASE, startDate: '2026-09-26', endDate: '2026-09-26' })).toHaveLength(23);
  });
});
