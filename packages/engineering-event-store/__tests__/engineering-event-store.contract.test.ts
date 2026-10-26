import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCorrelationId, SqliteEngineeringEventStore } from '../src/index';

describe('engineering event store contracts', () => {
  it('derives ARX-015 correlation ids only from execution ids', () => {
    expect(resolveCorrelationId('exec-1')).toBe('cor-exec-1');
    expect(resolveCorrelationId(undefined)).toBeUndefined();
    expect(resolveCorrelationId('   ')).toBeUndefined();
  });

  it('appends hash-chained truth events to sqlite', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-eng-events-')), 'events.db');
    const store = await SqliteEngineeringEventStore.open(dbPath);
    try {
      const first = store.append({
        type: 'plan.created',
        source: 'test',
        actorId: 'alice',
        authority: 'user',
        workspaceId: 'ws-1',
      });
      expect(first.seq).toBe(1);
      expect(typeof first.hash).toBe('string');
      const second = store.append({
        type: 'plan.approved',
        source: 'test',
        actorId: 'alice',
        authority: 'user',
        workspaceId: 'ws-1',
      });
      expect(second.seq).toBe(2);
      expect(second.previousHash).toBe(first.hash);
    } finally {
      store.close();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
  });
});
