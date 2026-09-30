/**
 * AR-TOOL-ASK-003A — Durable Runtime Interaction Authority evidence.
 *
 * Covers the 16 required behaviors:
 *  1. exact sessionID/requestId persisted byte-for-byte
 *  2. duplicate runtime ask is idempotent (no second interaction)
 *  3. pending cannot be claimed
 *  4. presentation creates token + version
 *  5. re-presentation rotates token/version
 *  6. stale token rejected
 *  7. stale version rejected
 *  8. wrong interaction rejected
 *  9. valid claim succeeds exactly once
 * 10. simultaneous claims produce one winner
 * 11. successful claim consumes token
 * 12. claimed interaction cannot be presented into an answerable state
 * 13. claimed interaction cannot be claimed again
 * 14. unclaimed TTL expiration is fail-closed
 * 15. the durable authority itself never invokes OpenCode reply/reject
 * 16. M9 remains evidence/projection only
 *
 * 003A boundary: NOTHING here performs OpenCode delivery. The live adapter
 * convergence path is covered by the AR-HITL-002A API tests.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectM9Schema, M9_SCHEMA_VERSION, migrateM9Schema } from '../src/m9-native-schema';
import { NativeSqliteActivityStore } from '../src/m9-native-sqlite-store';
import {
  deriveRuntimeQuestionInteractionId,
  RUNTIME_QUESTION_DEFAULT_TTL_MS,
  RuntimeQuestionTransitionError,
} from '../src/runtime-interaction-contract';
import { inspectRuntimeInteractionSchema, migrateRuntimeInteractionSchema } from '../src/runtime-interaction-schema';
import { RuntimeQuestionInteractionStore } from '../src/runtime-interaction-store';
import { answerRuntimeQuestion, ingestRuntimeQuestionAsked } from '../src/runtime-question-ingest';

const tempDirs: string[] = [];
const openDbs: DatabaseSync[] = [];

afterEach(() => {
  while (openDbs.length > 0) {
    try {
      openDbs.pop()?.close();
    } catch {
      /* best-effort */
    }
  }
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function openMemoryStore(): { db: DatabaseSync; store: RuntimeQuestionInteractionStore } {
  const db = new DatabaseSync(':memory:');
  openDbs.push(db);
  // Ownership split: M9 migration owns M9 objects only; the interaction
  // authority migrates its own schema explicitly.
  migrateM9Schema(db);
  migrateRuntimeInteractionSchema(db);
  return { db, store: new RuntimeQuestionInteractionStore(db) };
}

function openFileStores(): {
  dbPath: string;
  first: RuntimeQuestionInteractionStore;
  second: RuntimeQuestionInteractionStore;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vestara-003a-test-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'm9-activity.db');
  NativeSqliteActivityStore.migrate(dbPath);
  RuntimeQuestionInteractionStore.migrate(dbPath);
  const firstDb = new DatabaseSync(dbPath);
  const secondDb = new DatabaseSync(dbPath);
  openDbs.push(firstDb, secondDb);
  return {
    dbPath,
    first: new RuntimeQuestionInteractionStore(firstDb),
    second: new RuntimeQuestionInteractionStore(secondDb),
  };
}

const QUESTIONS = [
  {
    header: 'Deploy?',
    question: 'Deploy to production now?',
    options: [
      { label: 'Yes', description: 'Deploy immediately' },
      { label: 'No', description: 'Hold the deploy' },
    ],
  },
];

function ask(store: RuntimeQuestionInteractionStore, overrides: Record<string, unknown> = {}) {
  return store.ingestAsked({
    conversationId: 'conv-1',
    openCodeSessionId: 'ses_01HWXYZ',
    openCodeRequestId: 'req_abc123',
    questions: QUESTIONS,
    ...overrides,
  });
}

function presented(store: RuntimeQuestionInteractionStore, sessionId = 'ses_01HWXYZ', requestId = 'req_abc123') {
  const pending = ask(store, { openCodeSessionId: sessionId, openCodeRequestId: requestId });
  return store.present(pending.interactionId);
}

describe('AR-TOOL-ASK-003A durable runtime interaction authority', () => {
  it('1. persists exact sessionID/requestId byte-for-byte', () => {
    const { store } = openMemoryStore();
    const sessionId = '  Ses_MiXeD\tCase-01 ';
    const requestId = 'req:ünïcode/✓ 007';
    const created = ask(store, { openCodeSessionId: sessionId, openCodeRequestId: requestId });
    expect(created.openCodeSessionId).toBe(sessionId);
    expect(created.openCodeRequestId).toBe(requestId);
    const reread = store.get(created.interactionId);
    expect(reread?.openCodeSessionId).toBe(sessionId);
    expect(reread?.openCodeRequestId).toBe(requestId);
    // Identity derives from exact bytes: nearby strings diverge.
    expect(deriveRuntimeQuestionInteractionId(sessionId.trim(), requestId)).not.toBe(created.interactionId);
    expect(created.interactionId).toBe(deriveRuntimeQuestionInteractionId(sessionId, requestId));
    // Lookup by the exact pair resolves; a trimmed pair does not.
    expect(store.getByRuntimeIds(sessionId, requestId)?.interactionId).toBe(created.interactionId);
    expect(store.getByRuntimeIds(sessionId.trim(), requestId)).toBeUndefined();
  });

  it('2. duplicate runtime ask is idempotent and creates no second interaction', () => {
    const { db, store } = openMemoryStore();
    const first = ask(store);
    const second = ask(store);
    expect(second.interactionId).toBe(first.interactionId);
    expect(second.status).toBe('pending');
    expect(second.version).toBe(0);
    expect(second.questions).toEqual(first.questions);
    const count = (
      db.prepare('SELECT COUNT(*) AS count FROM runtime_question_interactions').get() as Record<string, unknown>
    ).count;
    expect(Number(count)).toBe(1);
    // A re-ask carrying different render data must not overwrite the first.
    const third = ask(store, {
      questions: [{ header: 'Other', question: 'Other?', options: [{ label: 'X' }] }],
    });
    expect(third.questions).toEqual(first.questions);
  });

  it('3. pending cannot be claimed', () => {
    const { store } = openMemoryStore();
    const pending = ask(store);
    expect(pending.status).toBe('pending');
    expect(pending.claimToken).toBeNull();
    expect(() =>
      store.claim({ interactionId: pending.interactionId, claimToken: 'any', expectedVersion: 0, answers: [['Yes']] }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('pending');
  });

  it('4. presentation creates token + version', () => {
    const { store } = openMemoryStore();
    const pending = ask(store);
    const shown = store.present(pending.interactionId);
    expect(shown.status).toBe('presented');
    expect(typeof shown.claimToken).toBe('string');
    expect((shown.claimToken as string).length).toBeGreaterThan(0);
    expect(shown.version).toBe(1);
    expect(shown.presentedAt).toBeDefined();
  });

  it('5. re-presentation rotates token/version', () => {
    const { store } = openMemoryStore();
    const pending = ask(store);
    const first = store.present(pending.interactionId);
    const second = store.present(pending.interactionId);
    expect(second.status).toBe('presented');
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.version).toBe(first.version + 1);
  });

  it('6. stale token rejected', () => {
    const { store } = openMemoryStore();
    const pending = ask(store);
    const first = store.present(pending.interactionId);
    const rotated = store.present(pending.interactionId);
    expect(() =>
      store.claim({
        interactionId: pending.interactionId,
        claimToken: first.claimToken as string,
        expectedVersion: rotated.version,
        answers: [['Yes']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('presented');
  });

  it('7. stale version rejected', () => {
    const { store } = openMemoryStore();
    const pending = ask(store);
    const first = store.present(pending.interactionId);
    const rotated = store.present(pending.interactionId);
    expect(() =>
      store.claim({
        interactionId: pending.interactionId,
        claimToken: rotated.claimToken as string,
        expectedVersion: first.version,
        answers: [['Yes']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('presented');
  });

  it('8. wrong interaction rejected', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const other = presented(store, 'ses_OTHER', 'req_other');
    expect(() =>
      store.claim({
        interactionId: other.interactionId,
        claimToken: shown.claimToken as string,
        expectedVersion: shown.version,
        answers: [['Yes']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(() =>
      store.claim({
        interactionId: 'rq-doesnotexist000000000000000000',
        claimToken: shown.claimToken as string,
        expectedVersion: shown.version,
        answers: [['Yes']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(shown.interactionId)?.status).toBe('presented');
    expect(store.get(other.interactionId)?.status).toBe('presented');
  });

  it('9. valid claim succeeds exactly once', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const claimed = answerRuntimeQuestion(store, {
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
      answers: [['Yes']],
      decidedBy: 'user:local',
    });
    expect(claimed.status).toBe('claimed');
    expect(claimed.answers).toEqual([['Yes']]);
    expect(claimed.decidedBy).toBe('user:local');
    expect(claimed.decidedAt).toBeDefined();
    expect(claimed.claimedAt).toBeDefined();
    expect(claimed.version).toBe(shown.version + 1);
  });

  it('9a. rejection claim preserves CAS lifecycle before delivery', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const claimed = store.claimRejection({
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
    });
    expect(claimed.status).toBe('claimed');
    expect(claimed.answers).toBeUndefined();
    const rejected = store.markDelivered(claimed.interactionId, 'rejected');
    expect(rejected.status).toBe('rejected');
    expect(store.listPending()).toHaveLength(0);
  });

  it('9b. delivery uncertainty is terminal and removes pending projection', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const claimed = store.claim({
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
      answers: [['Yes']],
    });
    const uncertain = store.markDelivered(claimed.interactionId, 'delivery-unknown');
    expect(uncertain.status).toBe('delivery-unknown');
    expect(store.listPending()).toHaveLength(0);
  });

  it('10. simultaneous claims produce one winner', () => {
    const { first, second } = openFileStores();
    const pending = first.ingestAsked({
      conversationId: 'conv-1',
      openCodeSessionId: 'ses_race',
      openCodeRequestId: 'req_race',
      questions: QUESTIONS,
    });
    const shown = first.present(pending.interactionId);
    const token = shown.claimToken as string;
    const version = shown.version;
    const attempts: Array<{ won: boolean }> = [];
    for (const store of [first, second]) {
      try {
        store.claim({
          interactionId: shown.interactionId,
          claimToken: token,
          expectedVersion: version,
          answers: [['Yes']],
        });
        attempts.push({ won: true });
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeQuestionTransitionError);
        attempts.push({ won: false });
      }
    }
    expect(attempts.filter((attempt) => attempt.won)).toHaveLength(1);
    expect(first.get(shown.interactionId)?.status).toBe('claimed');
  });

  it('11. successful claim consumes token', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const claimed = store.claim({
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
      answers: [['No']],
    });
    expect(claimed.claimToken).toBeNull();
    expect(store.get(shown.interactionId)?.claimToken).toBeNull();
  });

  it('12. claimed interaction cannot be presented into an answerable state again', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    store.claim({
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
      answers: [['Yes']],
    });
    expect(() => store.present(shown.interactionId)).toThrow(RuntimeQuestionTransitionError);
    const reread = store.get(shown.interactionId);
    expect(reread?.status).toBe('claimed');
    expect(reread?.claimToken).toBeNull();
  });

  it('13. claimed interaction cannot be claimed again', () => {
    const { store } = openMemoryStore();
    const shown = presented(store);
    const token = shown.claimToken as string;
    const version = shown.version;
    store.claim({
      interactionId: shown.interactionId,
      claimToken: token,
      expectedVersion: version,
      answers: [['Yes']],
    });
    expect(() =>
      store.claim({
        interactionId: shown.interactionId,
        claimToken: token,
        expectedVersion: version + 1,
        answers: [['Yes']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(shown.interactionId)?.status).toBe('claimed');
  });

  it('14. unclaimed TTL expiration is fail-closed', () => {
    const { store } = openMemoryStore();
    const nowMs = Date.now();
    const pending = ask(store, { nowMs, ttlMs: 1 });
    const result = store.expireUnclaimed(nowMs + RUNTIME_QUESTION_DEFAULT_TTL_MS);
    expect(result.expiredIds).toContain(pending.interactionId);
    expect(result.expiredCount).toBe(1);
    expect(store.get(pending.interactionId)?.status).toBe('expired');
    // Expired rows are terminal: neither presentable nor claimable.
    expect(() => store.present(pending.interactionId)).toThrow(RuntimeQuestionTransitionError);
    expect(() =>
      store.claim({ interactionId: pending.interactionId, claimToken: 'x', expectedVersion: 1, answers: [['Yes']] }),
    ).toThrow(RuntimeQuestionTransitionError);
    // A presented interaction that ages past TTL also fails closed on claim.
    const fresh = ask(store, { openCodeSessionId: 'ses_ttl2', openCodeRequestId: 'req_ttl2', nowMs });
    const shown = store.present(fresh.interactionId, nowMs);
    expect(() =>
      store.claim({
        interactionId: shown.interactionId,
        claimToken: shown.claimToken as string,
        expectedVersion: shown.version,
        answers: [['Yes']],
        nowMs: nowMs + RUNTIME_QUESTION_DEFAULT_TTL_MS + 1000,
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(shown.interactionId)?.status).toBe('expired');
  });

  it('15. no new-authority path invokes OpenCode reply/reject', () => {
    const sources = [
      '../src/runtime-interaction-contract.ts',
      '../src/runtime-interaction-store.ts',
      '../src/runtime-question-ingest.ts',
      '../src/m9-native-schema.ts',
      '../../../apps/api/src/assistant-opencode-adapter.ts',
    ];
    for (const source of sources) {
      const text = readFileSync(new URL(source, import.meta.url), 'utf8');
      const isAdapter = source.includes('assistant-opencode-adapter');
      if (!isAdapter) {
        expect(text, source).not.toContain('replyToQuestion');
        expect(text, source).not.toContain('rejectQuestion');
      }
      expect(text, source).not.toContain('RuntimeInteractionDelivery');
      expect(text, source).not.toContain('delivery lease');
    }
    // The adapter owns delivery, while this durable authority remains
    // transport-neutral.
    const adapter = readFileSync(
      new URL('../../../apps/api/src/assistant-opencode-adapter.ts', import.meta.url),
      'utf8',
    );
    expect(adapter).toContain('replyToQuestion');
    // The ingest hook never delivers: zero reply/reject invocations inside
    // the 003A ingestion block.
    const blockStart = adapter.indexOf('AR-TOOL-ASK-003A');
    const blockEnd = adapter.indexOf('const broker = options.interactionBroker;', blockStart);
    const ingestBlock = adapter.slice(blockStart, blockEnd);
    expect(blockStart).toBeGreaterThan(-1);
    expect(blockEnd).toBeGreaterThan(blockStart);
    expect(ingestBlock).not.toContain('replyToQuestion(');
    expect(ingestBlock).not.toContain('rejectQuestion(');
    // The store exposes no delivery surface at all.
    const proto = RuntimeQuestionInteractionStore.prototype as unknown as Record<string, unknown>;
    expect(proto).not.toHaveProperty('deliver');
    expect(proto).not.toHaveProperty('reply');
    expect(proto).not.toHaveProperty('lease');
  });

  it('16. M9 remains evidence/projection only', async () => {
    const { db } = openMemoryStore();
    const m9 = new NativeSqliteActivityStore(db);
    const proto = NativeSqliteActivityStore.prototype as unknown as Record<string, unknown>;
    expect(proto).not.toHaveProperty('present');
    expect(proto).not.toHaveProperty('claim');
    expect(proto).not.toHaveProperty('ingestAsked');
    // M9 appends never touch the runtime interaction authority table.
    await m9.append({
      eventId: 'evidence-only',
      type: 'system.event',
      timestamp: '2026-09-24T00:00:00.000Z',
      actor: { type: 'system', id: 'm9', displayName: 'M9' },
      source: 'system',
      payload: { message: 'evidence' },
    });
    const count = (
      db.prepare('SELECT COUNT(*) AS count FROM runtime_question_interactions').get() as Record<string, unknown>
    ).count;
    expect(Number(count)).toBe(0);
  });

  it('ingestion creates the durable interaction before answering (asked → claimed order)', () => {
    const { store } = openMemoryStore();
    const ingested = ingestRuntimeQuestionAsked(store, {
      conversationId: 'conv-order',
      openCodeSessionId: 'ses_order',
      openCodeRequestId: 'req_order',
      questions: QUESTIONS,
      providerId: 'opencode',
      modelId: 'test-model',
    });
    expect(ingested.status).toBe('pending');
    expect(ingested.providerId).toBe('opencode');
    expect(ingested.modelId).toBe('test-model');
    expect(ingested.executionId).toBeUndefined();
    expect(ingested.turnId).toBeUndefined();
    const shown = store.present(ingested.interactionId);
    const claimed = answerRuntimeQuestion(store, {
      interactionId: shown.interactionId,
      claimToken: shown.claimToken as string,
      expectedVersion: shown.version,
      answers: [['Yes']],
    });
    expect(claimed.status).toBe('claimed');
  });

  it('M9 v1 opens without the RuntimeInteraction table; interaction migrates independently', () => {
    const db = new DatabaseSync(':memory:');
    openDbs.push(db);
    db.exec(`
      CREATE TABLE m9_activity_events (
        activity_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        execution_id TEXT,
        trace_id TEXT,
        request_id TEXT,
        workflow_run_id TEXT,
        task_id TEXT,
        agent_assignment_id TEXT,
        repository_binding_id TEXT,
        runtime_session_binding_id TEXT,
        ai_binding_id TEXT,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        actor_display_name TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'all'
      );
      CREATE UNIQUE INDEX idx_m9_sequence_unique ON m9_activity_events(sequence_number);
      CREATE TABLE m9_sequence_allocator (allocator_id INTEGER PRIMARY KEY CHECK (allocator_id = 1), next_sequence INTEGER NOT NULL);
      INSERT INTO m9_activity_events (activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_display_name, source, payload_json, visibility)
        VALUES ('act-1-legacy', 'legacy-1', 1, 'system.event', '2026-09-24T00:00:00.000Z', 'system', 'Legacy', 'system', '{}', 'all');
      INSERT INTO m9_sequence_allocator (allocator_id, next_sequence) VALUES (1, 2);
      PRAGMA user_version = 1;
    `);
    // Ownership split: production-shape M9 v1 is current on its own; the
    // absent interaction schema fails closed under its own domain only.
    expect(M9_SCHEMA_VERSION).toBe(1);
    expect(inspectM9Schema(db).status).toBe('current');
    expect(inspectRuntimeInteractionSchema(db).status).toBe('migration-required');
    expect(() => new RuntimeQuestionInteractionStore(db)).toThrowError(
      expect.objectContaining({ name: 'RuntimeInteractionSchemaCompatibilityError' }),
    );
    // M9 migration must not create RuntimeInteraction objects.
    migrateM9Schema(db);
    expect(inspectM9Schema(db).status).toBe('current');
    expect(inspectRuntimeInteractionSchema(db).status).toBe('migration-required');
    // Explicit interaction migration adopts the database without touching M9.
    migrateRuntimeInteractionSchema(db);
    expect(inspectRuntimeInteractionSchema(db).status).toBe('current');
    const userVersion = (db.prepare('PRAGMA user_version').get() as Record<string, unknown>).user_version;
    expect(Number(userVersion)).toBe(1);
    const legacy = db.prepare('SELECT event_id FROM m9_activity_events WHERE event_id = ?').get('legacy-1') as
      | Record<string, unknown>
      | undefined;
    expect(legacy?.event_id).toBe('legacy-1');
    const store = new RuntimeQuestionInteractionStore(db);
    const created = ask(store);
    expect(created.status).toBe('pending');
  });

  it('rejects missing identities instead of inferring them', () => {
    const { store } = openMemoryStore();
    expect(() =>
      store.ingestAsked({ conversationId: '', openCodeSessionId: 's', openCodeRequestId: 'r', questions: QUESTIONS }),
    ).toThrow();
    expect(() =>
      store.ingestAsked({ conversationId: 'c', openCodeSessionId: '  ', openCodeRequestId: 'r', questions: QUESTIONS }),
    ).not.toThrow();
    expect(() =>
      store.ingestAsked({ conversationId: 'c', openCodeSessionId: 's', openCodeRequestId: 'r', questions: [] }),
    ).toThrow(RuntimeQuestionTransitionError);
  });
});
