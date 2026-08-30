import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { describe, expect, it, vi } from 'vitest';
import {
  approvalInteractionId,
  approvalToInteraction,
  CHOICE_APPROVE,
  CHOICE_REJECT,
  findUncontinuedApprovals,
  type HarnessApprovalReader,
  interactionApprovalId,
  interpretApprovalResponse,
  resolveFromInteractionResponse,
  type ThreadResolver,
} from '../src/harness-approval-interaction-adapter.js';

// ─── Test Helpers ──────────────────────────────────────────

const MOCK_APPROVAL = {
  approvalId: 'approval-abc-123',
  toolName: 'shell.execute',
  reason: 'Execute build command',
  risk: 'high',
  affectedResources: ['/tmp/test-build.sh'],
};

function createMockHarness(
  overrides?: Partial<{
    pendingApprovals: HarnessApprovalReader['pendingApprovals'];
    decideApproval: HarnessApprovalReader['decideApproval'];
  }>,
): HarnessApprovalReader {
  return {
    pendingApprovals: overrides?.pendingApprovals ?? vi.fn(async () => []),
    decideApproval: overrides?.decideApproval ?? vi.fn(async () => ({ thread: {}, turn: {} })),
  };
}

function createMockThreadResolver(threads?: Array<{ id: string; title: string }>): ThreadResolver {
  const map = new Map(threads?.map((t) => [t.id, t]) ?? []);
  return {
    getThread: (threadId: string) => map.get(threadId),
  };
}

// ─── approvalInteractionId ─────────────────────────────────

describe('AR-REC-C2 I3-I2 — Approval ↔ Interaction Adapter', () => {
  describe('approvalInteractionId', () => {
    it('derives interactionId deterministically from approvalId', () => {
      const id = approvalInteractionId('approval-abc');
      expect(id).toBe('harness-approval:approval-abc');
    });

    it('same approvalId always produces same interactionId', () => {
      const a = approvalInteractionId('approval-xyz');
      const b = approvalInteractionId('approval-xyz');
      expect(a).toBe(b);
    });

    it('different approvalIds produce different interactionIds', () => {
      const a = approvalInteractionId('approval-1');
      const b = approvalInteractionId('approval-2');
      expect(a).not.toBe(b);
    });
  });

  describe('interactionApprovalId', () => {
    it('extracts approvalId from harness approval interactionId', () => {
      const result = interactionApprovalId('harness-approval:approval-abc');
      expect(result).toBe('approval-abc');
    });

    it('returns undefined for non-harness interactionIds', () => {
      expect(interactionApprovalId('some-other:interaction')).toBeUndefined();
      expect(interactionApprovalId('random-string')).toBeUndefined();
      expect(interactionApprovalId('')).toBeUndefined();
    });

    it('roundtrips with approvalInteractionId', () => {
      const approvalId = 'approval-abc-123';
      const interactionId = approvalInteractionId(approvalId);
      expect(interactionApprovalId(interactionId)).toBe(approvalId);
    });
  });

  describe('CHOICE constants', () => {
    it('CHOICE_APPROVE is "approve"', () => {
      expect(CHOICE_APPROVE).toBe('approve');
    });

    it('CHOICE_REJECT is "reject"', () => {
      expect(CHOICE_REJECT).toBe('reject');
    });

    it('CHOICE_APPROVE and CHOICE_REJECT are distinct', () => {
      expect(CHOICE_APPROVE).not.toBe(CHOICE_REJECT);
    });
  });

  describe('interpretApprovalResponse', () => {
    it('interprets "approve" as true', () => {
      expect(interpretApprovalResponse(CHOICE_APPROVE)).toBe(true);
    });

    it('interprets "reject" as false', () => {
      expect(interpretApprovalResponse(CHOICE_REJECT)).toBe(false);
    });

    it('interprets unknown choice as undefined', () => {
      expect(interpretApprovalResponse('unknown' as ChoiceId)).toBeUndefined();
    });

    it('interprets empty string as undefined', () => {
      expect(interpretApprovalResponse('' as ChoiceId)).toBeUndefined();
    });
  });

  describe('approvalToInteraction', () => {
    it('produces a valid StructuredInteraction with required fields', () => {
      const interaction = approvalToInteraction(MOCK_APPROVAL);

      expect(interaction.interactionId).toBe('harness-approval:approval-abc-123');
      expect(interaction.presentingParticipantId).toBe('harness-approval:approval-abc-123');
      expect(interaction.presentingParticipantName).toBe('Agent Harness');
      expect(interaction.createdAt).toBeDefined();
      expect(typeof interaction.createdAt).toBe('string');
    });

    it('includes tool name and affected resources in content', () => {
      const interaction = approvalToInteraction(MOCK_APPROVAL);

      expect(interaction.content).toContain('shell.execute');
      expect(interaction.content).toContain('/tmp/test-build.sh');
      expect(interaction.content).toContain('Approve');
    });

    it('includes reason and risk in content', () => {
      const interaction = approvalToInteraction(MOCK_APPROVAL);

      expect(interaction.content).toContain('Execute build command');
      expect(interaction.content).toContain('high');
    });

    it('provides exactly two choices: approve and reject', () => {
      const interaction = approvalToInteraction(MOCK_APPROVAL);

      expect(interaction.choices).toHaveLength(2);
      expect(interaction.choices[0].choiceId).toBe(CHOICE_APPROVE);
      expect(interaction.choices[0].label).toBe('Approve');
      expect(interaction.choices[1].choiceId).toBe(CHOICE_REJECT);
      expect(interaction.choices[1].label).toBe('Reject');
    });

    it('includes thread context when threadInfo is provided', () => {
      const threadInfo = { id: 'thread-1', title: 'Build task' };
      const interaction = approvalToInteraction(MOCK_APPROVAL, threadInfo);

      expect(interaction.content).toContain('Build task');
      expect(interaction.content).toContain('thread:');
    });

    it('handles empty affectedResources with fallback text', () => {
      const approval = { ...MOCK_APPROVAL, affectedResources: [] as readonly string[] };
      const interaction = approvalToInteraction(approval);

      expect(interaction.content).toContain('unspecified resources');
    });

    it('handles multiple affectedResources joined by comma', () => {
      const approval = { ...MOCK_APPROVAL, affectedResources: ['/src/a.ts', '/src/b.ts'] as readonly string[] };
      const interaction = approvalToInteraction(approval);

      expect(interaction.content).toContain('/src/a.ts');
      expect(interaction.content).toContain('/src/b.ts');
    });
  });

  describe('resolveFromInteractionResponse', () => {
    it('resolves approve response for harness approval interaction', async () => {
      const harness = createMockHarness();
      const response: InteractionResponse = {
        responseId: 'resp-1' as InteractionId,
        interactionId: approvalInteractionId('approval-abc') as InteractionId,
        selectedChoiceId: CHOICE_APPROVE,
        respondedAt: new Date().toISOString(),
        respondingParticipantId: 'user-1',
        respondingParticipantName: 'Test User',
      };

      const result = await resolveFromInteractionResponse(approvalInteractionId('approval-abc'), response, harness);

      expect(result.resolved).toBe(true);
      expect(result.approved).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('resolves reject response for harness approval interaction', async () => {
      const harness = createMockHarness();
      const response: InteractionResponse = {
        responseId: 'resp-2' as InteractionId,
        interactionId: approvalInteractionId('approval-abc') as InteractionId,
        selectedChoiceId: CHOICE_REJECT,
        respondedAt: new Date().toISOString(),
        respondingParticipantId: 'user-1',
        respondingParticipantName: 'Test User',
      };

      const result = await resolveFromInteractionResponse(approvalInteractionId('approval-abc'), response, harness);

      expect(result.resolved).toBe(true);
      expect(result.approved).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('returns unresolved for non-harness interactionId', async () => {
      const harness = createMockHarness();
      const response: InteractionResponse = {
        responseId: 'resp-3' as InteractionId,
        interactionId: 'other:interaction' as InteractionId,
        selectedChoiceId: CHOICE_APPROVE,
        respondedAt: new Date().toISOString(),
        respondingParticipantId: 'user-1',
        respondingParticipantName: 'Test User',
      };

      const result = await resolveFromInteractionResponse('other:interaction', response, harness);

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('Not a harness approval');
    });

    it('returns unresolved for unknown choiceId', async () => {
      const harness = createMockHarness();
      const response: InteractionResponse = {
        responseId: 'resp-4' as InteractionId,
        interactionId: approvalInteractionId('approval-abc') as InteractionId,
        selectedChoiceId: 'unknown-choice' as ChoiceId,
        respondedAt: new Date().toISOString(),
        respondingParticipantId: 'user-1',
        respondingParticipantName: 'Test User',
      };

      const result = await resolveFromInteractionResponse(approvalInteractionId('approval-abc'), response, harness);

      expect(result.resolved).toBe(false);
      expect(result.error).toContain('Unknown choice');
    });
  });

  describe('findUncontinuedApprovals', () => {
    it('finds approvals with existing responses', async () => {
      const pendingApprovals = vi.fn(async () => [
        {
          approvalId: 'approval-1',
          threadId: 'thread-1',
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: ['/tmp/test.sh'],
        },
      ]);

      const getResponse = vi.fn(async () => ({
        response: {
          responseId: 'resp-1' as InteractionId,
          interactionId: approvalInteractionId('approval-1') as InteractionId,
          selectedChoiceId: CHOICE_APPROVE,
          respondedAt: new Date().toISOString(),
          respondingParticipantId: 'user-1',
          respondingParticipantName: 'Test User',
        },
        publishedAt: null,
      }));

      const harness = createMockHarness({ pendingApprovals });
      const interactionService = { getResponse } as never;

      const result = await findUncontinuedApprovals(harness, ['thread-1'], interactionService);

      expect(result).toHaveLength(1);
      expect(result[0].approvalId).toBe('approval-1');
      expect(result[0].threadId).toBe('thread-1');
      expect(result[0].response.selectedChoiceId).toBe(CHOICE_APPROVE);
    });

    it('returns empty when no approvals have responses', async () => {
      const pendingApprovals = vi.fn(async () => [
        {
          approvalId: 'approval-2',
          threadId: 'thread-2',
          toolName: 'shell.execute',
          reason: 'test',
          risk: 'high',
          affectedResources: [],
        },
      ]);

      const getResponse = vi.fn(async () => undefined);

      const harness = createMockHarness({ pendingApprovals });
      const interactionService = { getResponse } as never;

      const result = await findUncontinuedApprovals(harness, ['thread-2'], interactionService);

      expect(result).toHaveLength(0);
      expect(getResponse).toHaveBeenCalledWith(approvalInteractionId('approval-2'));
    });

    it('returns empty when no pending approvals exist', async () => {
      const pendingApprovals = vi.fn(async () => []);
      const harness = createMockHarness({ pendingApprovals });
      const interactionService = { getResponse: vi.fn() } as never;

      const result = await findUncontinuedApprovals(harness, ['thread-1'], interactionService);

      expect(result).toHaveLength(0);
    });

    it('scans multiple threads', async () => {
      const pendingApprovals = vi.fn(async (threadId: string) => {
        if (threadId === 'thread-a') {
          return [
            {
              approvalId: 'approval-a',
              threadId: 'thread-a',
              toolName: 'git.commit',
              reason: 'commit',
              risk: 'high',
              affectedResources: [],
            },
          ];
        }
        return [];
      });

      const getResponse = vi.fn(async () => ({
        response: {
          responseId: 'resp-a' as InteractionId,
          interactionId: approvalInteractionId('approval-a') as InteractionId,
          selectedChoiceId: CHOICE_REJECT,
          respondedAt: new Date().toISOString(),
          respondingParticipantId: 'user-1',
          respondingParticipantName: 'Test User',
        },
        publishedAt: null,
      }));

      const harness = createMockHarness({ pendingApprovals });
      const interactionService = { getResponse } as never;

      const result = await findUncontinuedApprovals(harness, ['thread-a', 'thread-b'], interactionService);

      expect(result).toHaveLength(1);
      expect(result[0].approvalId).toBe('approval-a');
      expect(result[0].threadId).toBe('thread-a');
      expect(result[0].response.selectedChoiceId).toBe(CHOICE_REJECT);
    });
  });
});
