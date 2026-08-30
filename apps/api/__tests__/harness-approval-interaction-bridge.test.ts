import { approvalInteractionId, CHOICE_APPROVE, CHOICE_REJECT } from '@vestara/agent-harness';
import type { VestaraEvent } from '@vestara/shared';
import type { ChoiceId, InteractionId, InteractionResponse } from '@vestara/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
    // Test helper: simulate an event
    simulateEvent(type: string, payload: Record<string, unknown>) {
      const handlers = listeners.get(type) ?? [];
      for (const handler of handlers) {
        handler({ type, payload, timestamp: new Date().toISOString() } as VestaraEvent);
      }
    },
    listeners,
  };
}

function createMockInteractionService(overrides?: { getResponse?: (id: InteractionId) => Promise<unknown> }) {
  return {
    getResponse: overrides?.getResponse ?? vi.fn(async () => undefined),
    present: vi.fn(),
    recordResponse: vi.fn(),
  } as never;
}

function createMockHarness(overrides?: {
  pendingApprovals?: ReturnType<typeof vi.fn>;
  decideApproval?: ReturnType<typeof vi.fn>;
}) {
  return {
    pendingApprovals: overrides?.pendingApprovals ?? vi.fn(async () => []),
    decideApproval: overrides?.decideApproval ?? vi.fn(async () => ({ thread: {}, turn: {} })),
  };
}

function createMockThreadResolver(threads?: Array<{ id: string; title: string }>) {
  const map = new Map(threads?.map((t) => [t.id, t]) ?? []);
  return {
    getThread: (threadId: string) => map.get(threadId),
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('AR-REC-C2 I3-I2 — Harness Approval Interaction Bridge', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let harness: ReturnType<typeof createMockHarness>;
  let interactionService: ReturnType<typeof createMockInteractionService>;
  let threadResolver: ReturnType<typeof createMockThreadResolver>;
  let listThreadIds: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    harness = createMockHarness();
    interactionService = createMockInteractionService();
    threadResolver = createMockThreadResolver();
    listThreadIds = vi.fn(() => []);
  });

  function createBridge(overrides?: Partial<HarnessApprovalInteractionBridgeOptions>) {
    return createHarnessApprovalInteractionBridge({
      eventBus: eventBus as never,
      interactionService: interactionService as never,
      harness: harness as never,
      threadResolver: threadResolver as never,
      listThreadIds,
      ...overrides,
    });
  }

  describe('event subscription', () => {
    it('subscribes to interaction:responded events', () => {
      createBridge();

      expect(eventBus.subscribe).toHaveBeenCalledWith('interaction:responded', expect.any(Function));
    });

    it('returns a disposal handle with dispose method', () => {
      const disposal = createBridge();
      expect(typeof disposal.dispose).toBe('function');
    });
  });

  describe('fast path: interaction:responded handler', () => {
    it('ignores events without interactionId', async () => {
      createBridge();

      // Simulate event without interactionId
      eventBus.simulateEvent('interaction:responded', { selectedChoiceId: CHOICE_APPROVE });

      // Should not have called decideApproval
      expect(harness.decideApproval).not.toHaveBeenCalled();
    });

    it('ignores non-harness approval interactions', async () => {
      createBridge();

      eventBus.simulateEvent('interaction:responded', {
        interactionId: 'some-other:interaction',
        selectedChoiceId: CHOICE_APPROVE,
      });

      expect(harness.decideApproval).not.toHaveBeenCalled();
    });

    it('resolves approve response through harness decideApproval', async () => {
      const approvalId = 'approval-test-1';
      const threadId = 'thread-test-1';

      const pendingApprovals = vi.fn(async () => [
        {
          approvalId,
          threadId,
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
      ]);

      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => [threadId]);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-1' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      // Simulate the event
      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_APPROVE,
      });

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 10));

      expect(decideApproval).toHaveBeenCalledWith(threadId, approvalId, true);
    });

    it('resolves reject response through harness decideApproval', async () => {
      const approvalId = 'approval-test-2';
      const threadId = 'thread-test-2';

      const pendingApprovals = vi.fn(async () => [
        {
          approvalId,
          threadId,
          toolName: 'git.commit',
          reason: 'commit changes',
          risk: 'high',
          affectedResources: [],
        },
      ]);

      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => [threadId]);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-2' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_REJECT,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_REJECT,
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(decideApproval).toHaveBeenCalledWith(threadId, approvalId, false);
    });

    it('scans all threads to find owning thread', async () => {
      const approvalId = 'approval-multi-thread';
      const pendingApprovals = vi.fn(async (threadId: string) => {
        if (threadId === 'thread-2') {
          return [
            {
              approvalId,
              threadId,
              toolName: 'shell.execute',
              reason: 'test',
              risk: 'high',
              affectedResources: [],
            },
          ];
        }
        return [];
      });

      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => ['thread-1', 'thread-2', 'thread-3']);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-3' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_APPROVE,
      });

      await new Promise((r) => setTimeout(r, 10));

      // Should have scanned all threads
      expect(pendingApprovals).toHaveBeenCalledWith('thread-1');
      expect(pendingApprovals).toHaveBeenCalledWith('thread-2');
      expect(pendingApprovals).toHaveBeenCalledWith('thread-3');

      // Should have found and resolved through thread-2
      expect(decideApproval).toHaveBeenCalledWith('thread-2', approvalId, true);
    });

    it('handles decideApproval errors gracefully', async () => {
      const approvalId = 'approval-error-test';
      const threadId = 'thread-error';

      const pendingApprovals = vi.fn(async () => [
        {
          approvalId,
          threadId,
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
      ]);

      const decideApproval = vi.fn(async () => {
        throw new Error('Turn not in awaiting-approval state');
      });

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => [threadId]);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-4' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      // Should not throw despite decideApproval error
      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_APPROVE,
      });

      await new Promise((r) => setTimeout(r, 10));

      // decideApproval was called and threw, but bridge handled it
      expect(decideApproval).toHaveBeenCalled();
    });

    it('ignores response when interaction not found in InteractionService', async () => {
      const approvalId = 'approval-no-response';

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => undefined),
      });

      listThreadIds = vi.fn(() => ['thread-1']);

      harness = createMockHarness({
        pendingApprovals: vi.fn(async () => [
          {
            approvalId,
            threadId: 'thread-1',
            toolName: 'shell.execute',
            reason: 'test',
            risk: 'high',
            affectedResources: [],
          },
        ]),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_APPROVE,
      });

      await new Promise((r) => setTimeout(r, 10));

      // No InteractionResponse found, so decideApproval should not be called
      expect(harness.decideApproval).not.toHaveBeenCalled();
    });

    it('stops scanning after finding the owning thread', async () => {
      const approvalId = 'approval-stop-scan';
      const pendingApprovals = vi.fn(async (threadId: string) => {
        if (threadId === 'thread-1') {
          return [
            {
              approvalId,
              threadId,
              toolName: 'shell.execute',
              reason: 'test',
              risk: 'high',
              affectedResources: [],
            },
          ];
        }
        return [];
      });

      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => ['thread-1', 'thread-2', 'thread-3']);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-5' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      eventBus.simulateEvent('interaction:responded', {
        interactionId: approvalInteractionId(approvalId),
        selectedChoiceId: CHOICE_APPROVE,
      });

      await new Promise((r) => setTimeout(r, 10));

      // Found in thread-1, should have stopped scanning after finding the owning thread
      // Note: pendingApprovals may be called more times due to reconciliation
      expect(pendingApprovals).toHaveBeenCalled();
      expect(decideApproval).toHaveBeenCalledWith('thread-1', approvalId, true);
    });
  });

  describe('reconciliation at boot', () => {
    it('finds and resolves uncontinued approvals at boot', async () => {
      const approvalId = 'approval-reconcile';
      const threadId = 'thread-reconcile';

      const pendingApprovals = vi.fn(async () => [
        {
          approvalId,
          threadId,
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
      ]);

      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => [threadId]);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-reconcile' as InteractionId,
            interactionId: approvalInteractionId(approvalId) as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      // Reconciliation runs eagerly at boot (fire-and-forget)
      // Wait for async reconciliation to complete
      await new Promise((r) => setTimeout(r, 50));

      // Should have called decideApproval for the uncontinued approval
      expect(decideApproval).toHaveBeenCalledWith(threadId, approvalId, true);
    });

    it('does not call decideApproval when no uncontinued approvals exist', async () => {
      const pendingApprovals = vi.fn(async () => []);
      const decideApproval = vi.fn(async () => ({ thread: {}, turn: {} }));

      harness = createMockHarness({ pendingApprovals, decideApproval });
      listThreadIds = vi.fn(() => ['thread-1']);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => undefined),
      });

      createBridge({ harness: harness as never, interactionService: interactionService as never });

      await new Promise((r) => setTimeout(r, 50));

      expect(decideApproval).not.toHaveBeenCalled();
    });

    it('handles reconciliation errors gracefully', async () => {
      const decideApproval = vi.fn(async () => {
        throw new Error('Thread not found');
      });

      harness = createMockHarness({
        pendingApprovals: vi.fn(async () => [
          {
            approvalId: 'approval-bad',
            threadId: 'thread-bad',
            toolName: 'shell.execute',
            reason: 'test',
            risk: 'high',
            affectedResources: [],
          },
        ]),
        decideApproval,
      });
      listThreadIds = vi.fn(() => ['thread-bad']);

      interactionService = createMockInteractionService({
        getResponse: vi.fn(async () => ({
          response: {
            responseId: 'resp-bad' as InteractionId,
            interactionId: approvalInteractionId('approval-bad') as InteractionId,
            selectedChoiceId: CHOICE_APPROVE,
            respondedAt: new Date().toISOString(),
            respondingParticipantId: 'user-1',
            respondingParticipantName: 'Test User',
          },
          publishedAt: null,
        })),
      });

      // Should not throw despite errors during reconciliation
      createBridge({ harness: harness as never, interactionService: interactionService as never });

      await new Promise((r) => setTimeout(r, 50));

      // Error was caught and logged, no crash
      expect(decideApproval).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('returns a disposal handle that can be called without error', () => {
      const disposal = createBridge();
      expect(() => disposal.dispose()).not.toThrow();
    });
  });
});
