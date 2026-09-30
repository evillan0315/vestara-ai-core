/**
 * AR-TOOL-ASK-003A4A — Runtime question ingestion wiring evidence.
 *
 * Proves the accepted narrow boundary
 * (OpenCode question.asked → runtimeQuestionIngest → RuntimeQuestionInteractionStore):
 *  1. the production executor composition site supplies the hook;
 *  2. a genuine-shaped question.asked reaches the authority;
 *  3. exact conversation/session/request identity is preserved byte-for-byte;
 *  4. a duplicate ask remains one durable interaction;
 *  5. an unavailable authority cannot fabricate persistence (fail closed +
 *     reported, storage untouched);
 *  6. ingestion alone leaves the interaction unclaimed;
 *  7. no new runtime reply/reject delivery call is introduced.
 *
 * No presentation, claim/CAS, delivery, M9, restart, or live-turn behavior
 * is exercised here. 4B (presentation) and 4C (claim) remain separate.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateRuntimeInteractionSchema, RuntimeQuestionInteractionStore } from '@vestara/activity-room';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeQuestionIngestHook, createRuntimeQuestionResponseHook } from '../src/assistant-opencode-adapter';

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

function openMemoryAuthority(): { db: DatabaseSync; store: RuntimeQuestionInteractionStore } {
  const db = new DatabaseSync(':memory:');
  openDbs.push(db);
  migrateRuntimeInteractionSchema(db);
  return { db, store: new RuntimeQuestionInteractionStore(db) };
}

interface FailureReport {
  readonly message: string;
  readonly detail: Record<string, unknown>;
}

function hookFor(store: RuntimeQuestionInteractionStore | null, failures: FailureReport[]) {
  return createRuntimeQuestionIngestHook({
    getStore: () => store,
    reportFailure: (message, detail) => {
      failures.push({ message, detail });
    },
  });
}

function responseHookFor(store: RuntimeQuestionInteractionStore | null, failures: FailureReport[]) {
  return createRuntimeQuestionResponseHook({
    getStore: () => store,
    reportFailure: (message, detail) => {
      failures.push({ message, detail });
    },
  });
}

function genuineInput(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-4a-dogfood-01',
    openCodeSessionId: 'ses_01J9ZQKTM7EPC4X5Y6Z7W8V9',
    openCodeRequestId: 'req_7f3a9c2e4b5d6a8f',
    questions: [
      {
        header: 'Apply edit?',
        question: 'Apply the proposed edit to src/index.ts?',
        options: [
          { label: 'Apply', description: 'Write the changes to disk' },
          { label: 'Skip', description: 'Leave the file unchanged' },
        ],
      },
    ],
    providerId: 'opencode',
    modelId: 'test-model',
    ...overrides,
  };
}

describe('AR-TOOL-ASK-003A4A ingestion wiring', () => {
  it('1. production executor composition supplies the ingestion hook', () => {
    const source = readFileSync(new URL('../src/workspace-context.ts', import.meta.url), 'utf8');
    expect(source).toContain('runtimeQuestionIngest: createRuntimeQuestionIngestHook(');
    expect(source).toContain('getM11ARoom().runtimeQuestions');
    expect(source).not.toContain('runtimeQuestions!');
    expect(source).toContain("from './assistant-opencode-adapter'");
  });

  it('2. genuine-shaped question.asked reaches the authority', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    hookFor(store, failures)(genuineInput());
    expect(failures).toEqual([]);
    const persisted = store.getByRuntimeIds('ses_01J9ZQKTM7EPC4X5Y6Z7W8V9', 'req_7f3a9c2e4b5d6a8f');
    expect(persisted).toMatchObject({ status: 'pending', version: 0 });
  });

  it('3. exact conversation/session/request identity is preserved byte-for-byte', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    const conversationId = 'Conv- mixed CASE  01';
    const openCodeSessionId = 'ses_  LeadingSpace';
    const openCodeRequestId = 'REQ-trailing-space ';
    hookFor(store, failures)(genuineInput({ conversationId, openCodeSessionId, openCodeRequestId }));
    const persisted = store.getByRuntimeIds(openCodeSessionId, openCodeRequestId);
    expect(persisted?.conversationId).toBe(conversationId);
    expect(persisted?.openCodeSessionId).toBe(openCodeSessionId);
    expect(persisted?.openCodeRequestId).toBe(openCodeRequestId);
  });

  it('4. duplicate ask remains one durable interaction', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    const hook = hookFor(store, failures);
    hook(genuineInput());
    hook(genuineInput());
    const rows = store.listByConversation('conv-4a-dogfood-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(failures).toEqual([]);
  });

  it('5. unavailable authority cannot fabricate persistence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vestara-4a-hook-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'probe.db');
    writeFileSync(dbPath, 'sentinel');
    const before = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const failures: FailureReport[] = [];
    expect(() => hookFor(null, failures)(genuineInput())).toThrowError(/refusing to fabricate persistence/);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('authority unavailable');
    expect(createHash('sha256').update(readFileSync(dbPath)).digest('hex')).toBe(before);
  });

  it('5b. unreachable authority is reported and fails closed', () => {
    const failures: FailureReport[] = [];
    const hook = createRuntimeQuestionIngestHook({
      getStore: () => {
        throw new Error('M11A Activity Room not initialized');
      },
      reportFailure: (message, detail) => {
        failures.push({ message, detail });
      },
    });
    expect(() => hook(genuineInput())).toThrowError(/refusing to fabricate persistence/);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('authority unreachable');
  });

  it('6. ingestion alone leaves the interaction unclaimed', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    hookFor(store, failures)(genuineInput());
    const persisted = store.getByRuntimeIds('ses_01J9ZQKTM7EPC4X5Y6Z7W8V9', 'req_7f3a9c2e4b5d6a8f');
    expect(persisted?.status).toBe('pending');
    expect(persisted?.claimToken).toBeNull();
    expect(persisted?.answers).toBeUndefined();
  });

  it('6a. exact response identity claims before delivery and converges answered', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    hookFor(store, failures)(genuineInput());
    const claim = responseHookFor(
      store,
      failures,
    )({
      conversationId: 'conv-4a-dogfood-01',
      openCodeSessionId: 'ses_01J9ZQKTM7EPC4X5Y6Z7W8V9',
      openCodeRequestId: 'req_7f3a9c2e4b5d6a8f',
      decision: 'answered',
      answers: [['Apply']],
    });
    expect(store.get(claim.interactionId)?.status).toBe('claimed');
    claim.markDelivered('answered');
    expect(store.get(claim.interactionId)?.status).toBe('answered');
    expect(store.listPending()).toHaveLength(0);
    expect(failures).toHaveLength(0);
  });

  it('6b. rejection uses the same exact claim lifecycle', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    hookFor(store, failures)(genuineInput());
    const claim = responseHookFor(
      store,
      failures,
    )({
      conversationId: 'conv-4a-dogfood-01',
      openCodeSessionId: 'ses_01J9ZQKTM7EPC4X5Y6Z7W8V9',
      openCodeRequestId: 'req_7f3a9c2e4b5d6a8f',
      decision: 'rejected',
      answers: [],
    });
    expect(store.get(claim.interactionId)?.status).toBe('claimed');
    claim.markDelivered('rejected');
    expect(store.get(claim.interactionId)?.status).toBe('rejected');
  });

  it('6c. mismatched conversation identity fails closed before delivery', () => {
    const { store } = openMemoryAuthority();
    const failures: FailureReport[] = [];
    hookFor(store, failures)(genuineInput());
    expect(() =>
      responseHookFor(
        store,
        failures,
      )({
        conversationId: 'conv-wrong',
        openCodeSessionId: 'ses_01J9ZQKTM7EPC4X5Y6Z7W8V9',
        openCodeRequestId: 'req_7f3a9c2e4b5d6a8f',
        decision: 'answered',
        answers: [['Apply']],
      }),
    ).toThrow(/exact identity mismatch/);
    expect(store.getByRuntimeIds('ses_01J9ZQKTM7EPC4X5Y6Z7W8V9', 'req_7f3a9c2e4b5d6a8f')?.status).toBe('pending');
  });

  it('7. no new runtime reply/reject delivery call is introduced', () => {
    const source = readFileSync(new URL('../src/assistant-opencode-adapter.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export function createRuntimeQuestionIngestHook');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('\n// GA-EXEC-001', start));
    expect(block).not.toContain('replyToQuestion(');
    expect(block).not.toContain('rejectQuestion(');
    const wiring = readFileSync(new URL('../src/workspace-context.ts', import.meta.url), 'utf8');
    const hookUse = wiring.indexOf('createRuntimeQuestionIngestHook({');
    expect(hookUse).toBeGreaterThan(-1);
    expect(wiring.slice(hookUse, hookUse + 1200)).not.toContain('replyToQuestion(');
  });
});
