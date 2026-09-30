/**
 * AR-TOOL-ASK-003A4B — Durable Presentation Authority evidence.
 *
 * Proves the 15 required behaviors:
 *  1. exact durable interaction resolves;
 *  2. wrong conversation identity fails closed;
 *  3. wrong interaction/request identity fails closed;
 *  4. missing durable interaction fails closed;
 *  5. pending → presented atomically;
 *  6. first presentation produces token/version;
 *  7. re-presentation rotates token and increments version;
 *  8. previous token becomes invalid;
 *  9. concurrent presentation leaves one authoritative credential;
 * 10. claimed cannot become answerable again;
 * 11. every terminal state cannot become answerable;
 * 12. Activity/SSE alone cannot enable answer controls (no credential
 *     without presentation: stored row keeps a null token);
 * 13. token never enters M9/SSE/Activity/log/diagnostic/conversation
 *     projection surfaces;
 * 14. presentation does not claim;
 * 15. presentation causes zero OpenCode reply/reject operations.
 *
 * 4B boundary: no claim submission (003A4C), no delivery (003B), no M9
 * command authority, no broker/reply-path change.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { RUNTIME_QUESTION_DEFAULT_TTL_MS, RuntimeQuestionTransitionError } from '../src/runtime-interaction-contract';
import { migrateRuntimeInteractionSchema } from '../src/runtime-interaction-schema';
import { RuntimeQuestionInteractionStore } from '../src/runtime-interaction-store';
import { presentRuntimeQuestionForBrowser } from '../src/runtime-question-presentation';

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
  migrateRuntimeInteractionSchema(db);
  return { db, store: new RuntimeQuestionInteractionStore(db) };
}

function openFileStores(): {
  first: RuntimeQuestionInteractionStore;
  second: RuntimeQuestionInteractionStore;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vestara-4b-present-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'm9-activity.db');
  RuntimeQuestionInteractionStore.migrate(dbPath);
  const firstDb = new DatabaseSync(dbPath);
  const secondDb = new DatabaseSync(dbPath);
  openDbs.push(firstDb, secondDb);
  return {
    first: new RuntimeQuestionInteractionStore(firstDb),
    second: new RuntimeQuestionInteractionStore(secondDb),
  };
}

const QUESTIONS = [
  {
    header: 'Apply edit?',
    question: 'Apply the proposed edit to src/index.ts?',
    options: [
      { label: 'Apply', description: 'Write the changes to disk' },
      { label: 'Skip', description: 'Leave the file unchanged' },
    ],
  },
];

function ask(sessionId = 'ses_4b_01', requestId = 'req_4b_01', conversationId = 'conv-4b-01') {
  const { store } = openMemoryStore();
  const pending = store.ingestAsked({
    conversationId,
    openCodeSessionId: sessionId,
    openCodeRequestId: requestId,
    questions: QUESTIONS,
  });
  return { store, pending };
}

describe('AR-TOOL-ASK-003A4B durable presentation authority', () => {
  it('1. exact durable interaction resolves', () => {
    const { store, pending } = ask();
    const presentation = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
      openCodeSessionId: 'ses_4b_01',
      openCodeRequestId: 'req_4b_01',
    });
    expect(presentation.interactionId).toBe(pending.interactionId);
    expect(presentation.conversationId).toBe('conv-4b-01');
    expect(presentation.openCodeSessionId).toBe('ses_4b_01');
    expect(presentation.openCodeRequestId).toBe('req_4b_01');
    expect(presentation.status).toBe('presented');
    expect(presentation.questions).toEqual(QUESTIONS);
  });

  it('2. wrong conversation identity fails closed without rotating the token', () => {
    const { store, pending } = ask();
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: pending.interactionId,
        conversationId: 'conv-WRONG',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    const reread = store.get(pending.interactionId);
    expect(reread?.status).toBe('pending');
    expect(reread?.version).toBe(0);
    expect(reread?.claimToken).toBeNull();
  });

  it('3. wrong interaction/request identity fails closed', () => {
    const { store, pending } = ask();
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: pending.interactionId,
        conversationId: 'conv-4b-01',
        openCodeSessionId: 'ses_WRONG',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: pending.interactionId,
        conversationId: 'conv-4b-01',
        openCodeRequestId: 'req_WRONG',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: 'rq-doesnotexist000000000000000000',
        conversationId: 'conv-4b-01',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('pending');
  });

  it('4. missing durable interaction fails closed', () => {
    const { store } = openMemoryStore();
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: 'rq-missing00000000000000000000',
        conversationId: 'conv-4b-01',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(() => presentRuntimeQuestionForBrowser(store, { interactionId: '', conversationId: 'conv-4b-01' })).toThrow(
      RuntimeQuestionTransitionError,
    );
  });

  it('5+6. pending → presented atomically; first presentation produces token/version', () => {
    const { store, pending } = ask();
    const presentation = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    expect(presentation.status).toBe('presented');
    expect(typeof presentation.claimToken).toBe('string');
    expect(presentation.claimToken.length).toBeGreaterThan(0);
    expect(presentation.version).toBe(1);
    expect(presentation.presentedAt).toBeDefined();
    const reread = store.get(pending.interactionId);
    expect(reread?.status).toBe('presented');
    expect(reread?.version).toBe(1);
  });

  it('7. re-presentation rotates token and increments version', () => {
    const { store, pending } = ask();
    const first = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    const second = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    expect(second.status).toBe('presented');
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.version).toBe(first.version + 1);
  });

  it('8. previous token becomes invalid', () => {
    const { store, pending } = ask();
    const first = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    const rotated = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    expect(() =>
      store.claim({
        interactionId: pending.interactionId,
        claimToken: first.claimToken,
        expectedVersion: rotated.version,
        answers: [['Apply']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('presented');
  });

  it('9. concurrent presentation leaves one authoritative credential', () => {
    const { first, second } = openFileStores();
    const pending = first.ingestAsked({
      conversationId: 'conv-4b-race',
      openCodeSessionId: 'ses_race',
      openCodeRequestId: 'req_race',
      questions: QUESTIONS,
    });
    const tokenA = presentRuntimeQuestionForBrowser(first, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-race',
    });
    const tokenB = presentRuntimeQuestionForBrowser(second, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-race',
    });
    expect(tokenB.claimToken).not.toBe(tokenA.claimToken);
    expect(() =>
      first.claim({
        interactionId: pending.interactionId,
        claimToken: tokenA.claimToken,
        expectedVersion: tokenA.version,
        answers: [['Apply']],
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    const won = second.claim({
      interactionId: pending.interactionId,
      claimToken: tokenB.claimToken,
      expectedVersion: tokenB.version,
      answers: [['Apply']],
    });
    expect(won.status).toBe('claimed');
  });

  it('10. claimed cannot become answerable again', () => {
    const { store, pending } = ask();
    const shown = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    store.claim({
      interactionId: shown.interactionId,
      claimToken: shown.claimToken,
      expectedVersion: shown.version,
      answers: [['Apply']],
    });
    expect(() =>
      presentRuntimeQuestionForBrowser(store, {
        interactionId: pending.interactionId,
        conversationId: 'conv-4b-01',
      }),
    ).toThrow(RuntimeQuestionTransitionError);
    expect(store.get(pending.interactionId)?.status).toBe('claimed');
  });

  it('11. every terminal state cannot become answerable', () => {
    const terminals: Array<{ status: string; setup: () => { store: RuntimeQuestionInteractionStore; id: string } }> = [
      {
        status: 'answered',
        setup: () => {
          const { store, pending } = ask('ses_t_ans', 'req_t_ans');
          const shown = store.present(pending.interactionId);
          const claimed = store.claim({
            interactionId: shown.interactionId,
            claimToken: shown.claimToken as string,
            expectedVersion: shown.version,
            answers: [['Apply']],
          });
          store.markDelivered(claimed.interactionId, 'answered');
          return { store, id: pending.interactionId };
        },
      },
      {
        status: 'rejected',
        setup: () => {
          const { store, pending } = ask('ses_t_rej', 'req_t_rej');
          const shown = store.present(pending.interactionId);
          const claimed = store.claim({
            interactionId: shown.interactionId,
            claimToken: shown.claimToken as string,
            expectedVersion: shown.version,
            answers: [['Skip']],
          });
          store.markDelivered(claimed.interactionId, 'rejected');
          return { store, id: pending.interactionId };
        },
      },
      {
        status: 'delivery-unknown',
        setup: () => {
          const { store, pending } = ask('ses_t_du', 'req_t_du');
          const shown = store.present(pending.interactionId);
          const claimed = store.claim({
            interactionId: shown.interactionId,
            claimToken: shown.claimToken as string,
            expectedVersion: shown.version,
            answers: [['Apply']],
          });
          store.markDelivered(claimed.interactionId, 'delivery-unknown');
          return { store, id: pending.interactionId };
        },
      },
      {
        status: 'orphaned',
        setup: () => {
          const { store, pending } = ask('ses_t_orp', 'req_t_orp');
          store.markOrphaned(pending.interactionId);
          return { store, id: pending.interactionId };
        },
      },
      {
        status: 'expired',
        setup: () => {
          const { db, store } = openMemoryStore();
          void db;
          const pending = store.ingestAsked({
            conversationId: 'conv-4b-01',
            openCodeSessionId: 'ses_t_exp',
            openCodeRequestId: 'req_t_exp',
            questions: QUESTIONS,
            nowMs: Date.now(),
            ttlMs: 1,
          });
          store.expireUnclaimed(Date.now() + RUNTIME_QUESTION_DEFAULT_TTL_MS);
          return { store, id: pending.interactionId };
        },
      },
    ];
    for (const terminal of terminals) {
      const { store, id } = terminal.setup();
      expect(store.get(id)?.status).toBe(terminal.status);
      expect(
        () => presentRuntimeQuestionForBrowser(store, { interactionId: id, conversationId: 'conv-4b-01' }),
        terminal.status,
      ).toThrow(RuntimeQuestionTransitionError);
    }
  });

  it('12. Activity/SSE hint alone yields no credential (stored row keeps a null token)', () => {
    const { store, pending } = ask();
    const reread = store.get(pending.interactionId);
    expect(reread?.status).toBe('pending');
    expect(reread?.claimToken).toBeNull();
  });

  it('13. token never enters M9/SSE/Activity/log/diagnostic/conversation projection surfaces', () => {
    const forbidden = [
      '../src/m9-adapter.ts',
      '../src/m10-projection-runtime.ts',
      '../src/stream.ts',
      '../src/service.ts',
      '../../conversation/src/index.ts',
      '../../../apps/api/src/assistant-execution-projection.ts',
      '../../../apps/api/src/diagnostics/collect.ts',
      '../../../apps/api/src/diagnostics/snapshots.ts',
    ];
    for (const source of forbidden) {
      const text = readFileSync(new URL(source, import.meta.url), 'utf8');
      expect(text, source).not.toContain('claimToken');
      expect(text, source).not.toContain('claim_token');
    }
    const route = readFileSync(new URL('../../../apps/api/src/routes/activity-room-m11a.ts', import.meta.url), 'utf8');
    expect(route).not.toContain('claim_token');
    expect(route).not.toMatch(/console\.\w+\(.*claimToken/);
    expect(route).not.toMatch(/logger\.\w+\(.*claimToken/);
  });

  it('14. presentation does not claim', () => {
    const { store, pending } = ask();
    const presentation = presentRuntimeQuestionForBrowser(store, {
      interactionId: pending.interactionId,
      conversationId: 'conv-4b-01',
    });
    expect(presentation.status).toBe('presented');
    const reread = store.get(pending.interactionId);
    expect(reread?.status).toBe('presented');
    expect(reread?.answers).toBeUndefined();
    expect(reread?.decidedBy).toBeUndefined();
    expect(reread?.claimToken).not.toBeNull();
  });

  it('15. presentation causes zero OpenCode reply/reject operations', () => {
    for (const source of [
      '../src/runtime-question-presentation.ts',
      '../../../apps/api/src/routes/activity-room-m11a.ts',
    ]) {
      const text = readFileSync(new URL(source, import.meta.url), 'utf8');
      expect(text, source).not.toContain('replyToQuestion(');
      expect(text, source).not.toContain('rejectQuestion(');
      expect(text, source).not.toContain('RuntimeInteractionDelivery');
    }
    const proto = RuntimeQuestionInteractionStore.prototype as unknown as Record<string, unknown>;
    expect(proto).not.toHaveProperty('deliver');
    expect(proto).not.toHaveProperty('reply');
    expect(proto).not.toHaveProperty('lease');
  });
});
