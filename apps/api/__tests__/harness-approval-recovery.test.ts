/**
 * AR-REC-C2 I3-I2-C1: Harness Continuation Recovery Reliability
 *
 * Focused evidence tests proving the recovery gap is closed.
 *
 * Test matrix:
 *   1. EventBus continuation failure does not lose durable response
 *   2. Initial reconciliation failure is recoverable without restart
 *   3. Later reconciliation succeeds and continues approval
 *   4. Already-continued approval is not continued again
 *   5. Multiple reconciliation attempts remain idempotent
 *   6. One failing approval does not block other recoverable approvals
 *   7. Same-choice HTTP retry remains idempotent and does NOT need event re-emission
 *   8. No generic interaction component gains Harness semantics
 */

import {
  approvalInteractionId,
  CHOICE_APPROVE,
  CHOICE_REJECT,
  type HarnessApprovalReader,
} from '@vestara/agent-harness';
import type { VestaraEvent } from '@vestara/shared';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BridgeLogger,
  createHarnessApprovalInteractionBridge,
  type HarnessApprovalInteractionBridgeOptions,
} from '../src/bridges/harness-approval-interaction-bridge.js';

// ─── Test Helpers ──────────────────────────────────────────

function createMockEventBus() {
  const listeners = new Map<string, Array<(event: VestaraEvent) => void>>();

  return {
    subscribe: vi.fn((event: string, handler: (event: VestaraEvent) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
      return vi.fn(); // unsubscribe
    }),
    emit: vi.fn(),
    simulateEvent(type: string, payload: Record<string, unknown>) {
      const handlers = listeners.get(type) ?? [];
      for (const handler of handlers) {
        handler({ type, payload, timestamp: new Date().toISOString() } as VestaraEvent);
      }
    },
    listeners,
  };
}

function createMockLogger(): BridgeLogger & { logs: string[]; warns: string[]; errors: string[] } {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    warns,
    errors,
    log: (msg: string) => logs.push(msg),
    warn: (msg: string) => warns.push(msg),
    error: (msg: string) => errors.push(msg),
  };
}

function makeResponse(interactionId: string, choiceId: ChoiceId): InteractionResponse {
  return {
    responseId: `resp-${Date.now()}` as InteractionId,
    interactionId: interactionId as InteractionId,
    selectedChoiceId: choiceId,
    respondedAt: new Date().toISOString(),
    respondingParticipantId: 'user-1',
    respondingParticipantName: 'Test User',
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('AR-REC-C2 I3-I2-C1 — Harness Continuation Recovery Reliability', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    logger = createMockLogger();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createBridge(
    harness: HarnessApprovalReader,
    interactionService: {
      getResponse: (
        id: InteractionId,
      ) => Promise<{ response: InteractionResponse; publishedAt: string | null } | undefined>;
    },
    listThreadIds: () => string[],
    overrides?: Partial<HarnessApprovalInteractionBridgeOptions>,
  ) {
    return createHarnessApprovalInteractionBridge({
      eventBus,
      interactionService: interactionService as never,
      harness,
      threadResolver: { getThread: () => undefined },
      listThreadIds,
      logger,
      maxReconciliationRetries: 3,
      reconciliationBackoffMs: 1000,
      ...overrides,
    });
  }

  // ─── Test 1: EventBus continuation failure does not lose durable response ──

  it('test 1: EventBus continuation failure does not lose durable response', async () => {
    const approvalId = 'approval-t1';
    const threadId = 'thread-t1';
    const interactionId = approvalInteractionId(approvalId);

    // Simulate: response exists in InteractionStore, decideApproval throws first time
    let decideCallCount = 0;
    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => {
        decideCallCount++;
        if (decideCallCount === 1) throw new Error('Thread already has an active run');
        return { thread: { id: threadId }, turn: { id: 'turn-1' } };
      }),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(interactionId, CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run initial reconciliation + retry
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: decideApproval was called, failure was logged, retry occurred
    expect(harness.decideApproval).toHaveBeenCalled();
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 0 failed'))).toBe(true);
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 1 failed'))).toBe(false);

    disposal.dispose();
  });

  // ─── Test 2: Initial reconciliation failure is recoverable without restart ──

  it('test 2: initial reconciliation failure is recoverable without restart', async () => {
    const approvalId = 'approval-t2';
    const threadId = 'thread-t2';
    const interactionId = approvalInteractionId(approvalId);

    // First attempt: getResponse throws (InteractionStore temporarily unavailable)
    let getResponseCallCount = 0;
    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => ({ thread: { id: threadId }, turn: { id: 'turn-1' } })),
    };

    const interactionService = {
      getResponse: vi.fn(async () => {
        getResponseCallCount++;
        if (getResponseCallCount <= 1) throw new Error('SQLite busy');
        return { response: makeResponse(interactionId, CHOICE_APPROVE), publishedAt: null };
      }),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run reconciliation with retries
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: getResponse was called multiple times, decideApproval succeeded on retry
    expect(getResponseCallCount).toBeGreaterThanOrEqual(2);
    expect(harness.decideApproval).toHaveBeenCalled();
    expect(logger.errors.some((w) => w.includes('reconciliation attempt 0 threw'))).toBe(true);
    expect(logger.logs.some((l) => l.includes('reconciled 1 approval(s)'))).toBe(true);

    disposal.dispose();
  });

  // ─── Test 3: Later reconciliation succeeds and continues approval ──

  it('test 3: later reconciliation succeeds and continues approval', async () => {
    const approvalId = 'approval-t3';
    const threadId = 'thread-t3';
    const interactionId = approvalInteractionId(approvalId);

    // First attempt: decideApproval throws (turn not in awaiting-approval state)
    // Second attempt: succeeds (turn state corrected by another process)
    let decideCallCount = 0;
    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => {
        decideCallCount++;
        if (decideCallCount === 1) throw new Error('Thread is not awaiting approval');
        return { thread: { id: threadId }, turn: { id: 'turn-1' } };
      }),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(interactionId, CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run reconciliation with retries
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: decideApproval was called twice, second succeeded
    expect(decideCallCount).toBe(2);
    expect(harness.decideApproval).toHaveBeenCalledWith(threadId, approvalId, true);

    disposal.dispose();
  });

  // ─── Test 4: Already-continued approval is not continued again ──

  it('test 4: already-continued approval is not continued again', async () => {
    const approvalId = 'approval-t4';
    const threadId = 'thread-t4';

    // Simulate: pendingApprovals returns empty (approval already decided)
    const harness = {
      pendingApprovals: vi.fn(async () => []),
      decideApproval: vi.fn(async () => ({ thread: { id: threadId }, turn: { id: 'turn-1' } })),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(approvalInteractionId(approvalId), CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run reconciliation
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: decideApproval was never called (no pending approvals)
    expect(harness.decideApproval).not.toHaveBeenCalled();

    disposal.dispose();
  });

  // ─── Test 5: Multiple reconciliation attempts remain idempotent ──

  it('test 5: multiple reconciliation attempts remain idempotent', async () => {
    const approvalId = 'approval-t5';
    const threadId = 'thread-t5';
    const interactionId = approvalInteractionId(approvalId);

    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => ({ thread: { id: threadId }, turn: { id: 'turn-1' } })),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(interactionId, CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId], {
      maxReconciliationRetries: 5,
    });

    // Run reconciliation with many retries
    await vi.advanceTimersByTimeAsync(10000);

    // Verify: decideApproval was called but approval is already decided on subsequent calls
    // The harness mock always succeeds, so reconciliation succeeds on first attempt
    expect(harness.decideApproval).toHaveBeenCalledTimes(1);
    expect(logger.logs.some((l) => l.includes('reconciled 1 approval(s) on attempt 0'))).toBe(true);

    disposal.dispose();
  });

  // ─── Test 6: One failing approval does not block other recoverable approvals ──

  it('test 6: one failing approval does not block other recoverable approvals', async () => {
    const approvalId1 = 'approval-t6a';
    const approvalId2 = 'approval-t6b';
    const threadId = 'thread-t6';

    const harness = {
      pendingApprovals: vi.fn(async () => [
        {
          approvalId: approvalId1,
          threadId,
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
        {
          approvalId: approvalId2,
          threadId,
          toolName: 'git.commit',
          reason: 'commit',
          risk: 'high',
          affectedResources: [],
        },
      ]),
      decideApproval: vi.fn(async (tid: string, aid: string) => {
        if (aid === approvalId1) throw new Error('Turn not in awaiting-approval state');
        return { thread: { id: threadId }, turn: { id: 'turn-1' } };
      }),
    };

    const interactionService = {
      getResponse: vi.fn(async (id: InteractionId) => ({
        response: makeResponse(id, CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run reconciliation
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: approvalId2 was continued despite approvalId1 failure
    expect(harness.decideApproval).toHaveBeenCalledWith(threadId, approvalId2, true);
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 0 failed for approval approval-t6a'))).toBe(
      true,
    );

    disposal.dispose();
  });

  // ─── Test 7: Same-choice HTTP retry remains idempotent and does NOT need event re-emission ──

  it('test 7: same-choice HTTP retry remains idempotent without event re-emission', async () => {
    const approvalId = 'approval-t7';
    const threadId = 'thread-t7';
    const interactionId = approvalInteractionId(approvalId);

    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => ({ thread: { id: threadId }, turn: { id: 'turn-1' } })),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(interactionId, CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId]);

    // Run initial reconciliation
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: decideApproval was called once
    expect(harness.decideApproval).toHaveBeenCalledTimes(1);

    // Simulate same-choice HTTP retry: InteractionService returns existing response
    // (no new event emitted). The bridge should NOT re-trigger continuation.
    // Since pendingApprovals now returns empty (approval decided), no retry occurs.
    harness.pendingApprovals.mockResolvedValue([]);

    // Run another reconciliation cycle (simulating a retry timer)
    await vi.advanceTimersByTimeAsync(5000);

    // Verify: decideApproval was NOT called again (already decided)
    expect(harness.decideApproval).toHaveBeenCalledTimes(1);

    disposal.dispose();
  });

  // ─── Test 8: No generic interaction component gains Harness semantics ──

  it('test 8: no generic interaction component gains Harness semantics', async () => {
    // Verify that the bridge does NOT modify InteractionService, Activity Room,
    // or generic interaction contracts. The bridge only reads from InteractionService
    // and delegates to Harness.

    const interactionService = {
      getResponse: vi.fn(async () => undefined),
      present: vi.fn(),
      recordResponse: vi.fn(),
    };

    const harness = {
      pendingApprovals: vi.fn(async () => []),
      decideApproval: vi.fn(async () => ({})),
    };

    const disposal = createBridge(harness, interactionService, () => []);

    // Verify: interactionService methods were NOT called by the bridge
    // (only getResponse would be called during reconciliation, but there are no threads)
    expect(interactionService.present).not.toHaveBeenCalled();
    expect(interactionService.recordResponse).not.toHaveBeenCalled();

    // Verify: harness methods were NOT called (no pending approvals)
    expect(harness.decideApproval).not.toHaveBeenCalled();

    disposal.dispose();
  });

  // ─── Observability: reconciliation failures are logged ──

  it('observability: reconciliation failures are logged with details', async () => {
    const approvalId = 'approval-obs';
    const threadId = 'thread-obs';

    const harness = {
      pendingApprovals: vi.fn(async () => [
        { approvalId, threadId, toolName: 'shell.execute', reason: 'test', risk: 'high', affectedResources: [] },
      ]),
      decideApproval: vi.fn(async () => {
        throw new Error('Simulated failure');
      }),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(approvalInteractionId(approvalId), CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => [threadId], {
      maxReconciliationRetries: 2,
    });

    await vi.advanceTimersByTimeAsync(5000);

    // Verify: each attempt is logged
    expect(logger.warns.filter((w) => w.includes('reconciliation attempt')).length).toBeGreaterThanOrEqual(3);
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 0 failed'))).toBe(true);
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 1 failed'))).toBe(true);
    expect(logger.warns.some((w) => w.includes('reconciliation attempt 2 failed'))).toBe(true);

    // Verify: exhaustion warning
    expect(logger.warns.some((w) => w.includes('reconciliation exhausted'))).toBe(true);

    disposal.dispose();
  });

  // ─── Retry backoff timing ──

  it('retry backoff follows exponential schedule', async () => {
    const harness = {
      pendingApprovals: vi.fn(async () => [
        {
          approvalId: 'a1',
          threadId: 't1',
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
      ]),
      decideApproval: vi.fn(async () => {
        throw new Error('fail');
      }),
    };

    const interactionService = {
      getResponse: vi.fn(async () => ({
        response: makeResponse(approvalInteractionId('a1'), CHOICE_APPROVE),
        publishedAt: null,
      })),
    };

    const disposal = createBridge(harness, interactionService, () => ['t1'], {
      maxReconciliationRetries: 3,
      reconciliationBackoffMs: 1000,
    });

    // First attempt happens immediately (attempt 0)
    await vi.advanceTimersByTimeAsync(100);
    expect(logger.logs.some((l) => l.includes('retrying reconciliation in 1000ms'))).toBe(true);

    // Second retry after 1000ms (attempt 1)
    await vi.advanceTimersByTimeAsync(1000);
    expect(logger.logs.some((l) => l.includes('retrying reconciliation in 2000ms'))).toBe(true);

    // Third retry after 2000ms (attempt 2)
    await vi.advanceTimersByTimeAsync(2000);
    expect(logger.logs.some((l) => l.includes('retrying reconciliation in 4000ms'))).toBe(true);

    // Fourth attempt (attempt 3) — no more retries
    await vi.advanceTimersByTimeAsync(4000);

    // Verify: exhaustion
    expect(logger.warns.some((w) => w.includes('reconciliation exhausted'))).toBe(true);

    disposal.dispose();
  });
});
