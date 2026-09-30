import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeSqliteActivityStore } from '../src/m9-native-sqlite-store';
import { SqliteActivityStore } from '../src/m9-sqlite-store';
import type { ActivityEvent, M9ActivityStore } from '../src/m9-types';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

async function createSqlJsStore(): Promise<{ store: M9ActivityStore; close: () => void }> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return { store: new SqliteActivityStore(db), close: () => db.close() };
}

function createNativeStore(): { store: M9ActivityStore; close: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vestara-m9-pagination-test-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'm9-activity.db');
  NativeSqliteActivityStore.migrate(dbPath);
  const store = NativeSqliteActivityStore.open(dbPath);
  return { store, close: () => store.close() };
}

function event(index: number): ActivityEvent {
  return {
    eventId: `pagination:event:${index}`,
    type: index % 3 === 0 ? 'tool.called' : 'system.event',
    timestamp: new Date(Date.UTC(2026, 8, 14, 0, 0, index)).toISOString(),
    actor: { type: 'system', id: 'pagination-test', displayName: 'Pagination test' },
    source: 'system',
    payload: { message: `activity ${index}` },
  };
}

const TOTAL = 130;
const PAGE = 50;

const implementations: ReadonlyArray<{
  name: string;
  create: () => Promise<{ store: M9ActivityStore; close: () => void }>;
}> = [
  { name: 'sql.js SqliteActivityStore', create: createSqlJsStore },
  { name: 'native NativeSqliteActivityStore', create: async () => createNativeStore() },
];

describe.each(implementations.map((entry) => entry.name))('AR-HISTORY-002 backward pagination: %s', (name) => {
  const factory = implementations.find((entry) => entry.name === name)!.create;

  async function seed(): Promise<{ store: M9ActivityStore; close: () => void }> {
    const state = await factory();
    for (let index = 1; index <= TOTAL; index += 1) await state.store.append(event(index));
    return state;
  }

  const sequences = (records: readonly { sequenceNumber: number }[]): number[] =>
    records.map((record) => record.sequenceNumber);

  it('returns the immediately preceding window, not the globally oldest rows', async () => {
    const state = await seed();
    try {
      // Newest bounded page via forward cursor (mirrors catch-up semantics).
      const newest = await state.store.query({
        after: { sequenceNumber: TOTAL - PAGE, eventId: '', timestamp: '' },
        limit: PAGE,
      });
      expect(sequences(newest)).toEqual(Array.from({ length: PAGE }, (_, i) => TOTAL - PAGE + 1 + i));

      const oldest = sequences(newest)[0]!;
      const previous = await state.store.query({ beforeSequence: oldest, limit: PAGE });
      expect(sequences(previous)).toEqual(Array.from({ length: PAGE }, (_, i) => oldest - PAGE + i));
      // The pre-repair defect returned sequences 1..50 here.
      expect(sequences(previous)[0]).toBeGreaterThan(1);
    } finally {
      state.close();
    }
  });

  it('paginates contiguously across at least three pages with no gaps or duplicates', async () => {
    const state = await seed();
    try {
      const pages: number[][] = [];
      // Walk backward from above the frontier, as "Load older history" does.
      let cursor: number = TOTAL + 1;
      for (let depth = 0; depth < 4; depth += 1) {
        const page = await state.store.query({ beforeSequence: cursor, limit: PAGE });
        if (page.length === 0) break;
        const seqs = sequences(page);
        // Canonical ascending order within every page.
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
        pages.push(seqs);
        cursor = seqs[0];
      }
      expect(pages.length).toBeGreaterThanOrEqual(3);
      const all = pages.flat();
      // No duplicates, no gaps, full coverage down to sequence 1
      // (pages arrive newest-first; canonical order is verified per page above).
      expect(new Set(all).size).toBe(all.length);
      expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1));
      // Page boundary exclusivity: each page starts exactly where the previous page ended.
      for (let i = 1; i < pages.length; i += 1) {
        expect(pages[i]![pages[i]!.length - 1]).toBe(pages[i - 1]![0]! - 1);
      }
    } finally {
      state.close();
    }
  });

  it('terminates at sequence 1 with an empty exclusive page', async () => {
    const state = await seed();
    try {
      const first = await state.store.query({ beforeSequence: 2, limit: PAGE });
      expect(sequences(first)).toEqual([1]);
      expect(await state.store.query({ beforeSequence: 1, limit: PAGE })).toEqual([]);
    } finally {
      state.close();
    }
  });

  it('preserves existing filter semantics on backward and forward queries', async () => {
    const state = await seed();
    try {
      // Backward page with a type filter: newest 50 tool.called records below the frontier.
      const filtered = await state.store.query({ type: 'tool.called', beforeSequence: TOTAL + 1, limit: PAGE });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((record) => record.type === 'tool.called')).toBe(true);
      const seqs = sequences(filtered);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(seqs[seqs.length - 1]).toBeLessThanOrEqual(TOTAL);
      // Forward (unbounded-below) queries keep oldest-first ascending semantics.
      const forward = await state.store.query({ type: 'system.event', limit: 5 });
      expect(forward.length).toBe(5);
      expect(forward.every((record) => record.type === 'system.event')).toBe(true);
      expect(sequences(forward)).toEqual([...sequences(forward)].sort((a, b) => a - b));
    } finally {
      state.close();
    }
  });
});
