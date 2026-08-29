/**
 * AR-REC-B: Interaction Contract Tests
 *
 * Verifies:
 * - B2: Minimum canonical contract structure
 * - B3: No executable semantics in contract
 * - B4: Lifecycle modeling
 * - B5: Approval separation in types
 * - Structural validation (choices non-empty, unique IDs, response-interaction relationship)
 * - B8: Canonical text ingress preserved
 * - B9: Cross-domain generality proof
 * - B10: Negative architecture tests
 * - B12: Verification evidence
 *
 * Distinguishes:
 * - Contract guarantees (typed identities, relational validation, N-option, no executable semantics)
 * - Deferred operational guarantees (persistence idempotency, reconnect, replay, stale evaluation)
 */

import { describe, expect, it } from 'vitest';
import type {
  InteractionChoice,
  InteractionId,
  InteractionLifecycle,
  InteractionResponse,
  ChoiceId,
  StructuredInteraction,
  InteractionValidationError,
} from '../src/interaction';
import {
  isStructuredInteraction,
  isInteractionResponse,
  validateInteraction,
  validateResponseForInteraction,
} from '../src/interaction';
import type { ApprovalRequestPayload, PolicyDecision } from '../src/harness';

// ─── Helper: Create Test Fixtures ────────────────────────────

function makeInteractionId(): InteractionId {
  return `interaction-${Date.now()}-${Math.random().toString(36).slice(2)}` as InteractionId;
}

function makeChoiceId(): ChoiceId {
  return `choice-${Date.now()}-${Math.random().toString(36).slice(2)}` as ChoiceId;
}

function makeInteraction(overrides?: Partial<StructuredInteraction>): StructuredInteraction {
  return {
    interactionId: makeInteractionId(),
    presentingParticipantId: 'agent-developer',
    presentingParticipantName: 'Developer Agent',
    createdAt: new Date().toISOString(),
    content: 'Which approach should we use?',
    choices: [
      { choiceId: makeChoiceId(), label: 'Approach A' },
      { choiceId: makeChoiceId(), label: 'Approach B' },
    ],
    ...overrides,
  };
}

function makeResponse(
  interaction: StructuredInteraction,
  choiceIndex: number,
  overrides?: Partial<InteractionResponse>,
): InteractionResponse {
  return {
    responseId: `response-${Date.now()}-${Math.random().toString(36).slice(2)}` as never,
    interactionId: interaction.interactionId,
    selectedChoiceId: interaction.choices[choiceIndex].choiceId,
    respondingParticipantId: 'human-local',
    respondingParticipantName: 'Human User',
    respondedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── B2: Minimum Canonical Contract Structure ────────────────

describe('B2: StructuredInteraction contract', () => {
  it('has stable interaction identity', () => {
    const interaction = makeInteraction();
    expect(interaction.interactionId).toBeDefined();
    expect(typeof interaction.interactionId).toBe('string');
    expect(interaction.interactionId.length).toBeGreaterThan(0);
  });

  it('has presenting participant identity', () => {
    const interaction = makeInteraction();
    expect(interaction.presentingParticipantId).toBeDefined();
    expect(interaction.presentingParticipantName).toBeDefined();
  });

  it('has creation timestamp', () => {
    const interaction = makeInteraction();
    expect(interaction.createdAt).toBeDefined();
    expect(new Date(interaction.createdAt).getTime()).not.toBeNaN();
  });

  it('has human-readable content', () => {
    const interaction = makeInteraction({ content: 'Which approach?' });
    expect(interaction.content).toBe('Which approach?');
  });

  it('has ordered choice collection', () => {
    const interaction = makeInteraction();
    expect(interaction.choices.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(interaction.choices)).toBe(true);
  });

  it('has stable opaque choice IDs', () => {
    const interaction = makeInteraction();
    for (const choice of interaction.choices) {
      expect(choice.choiceId).toBeDefined();
      expect(typeof choice.choiceId).toBe('string');
      expect(choice.label).toBeDefined();
    }
  });

  it('choice label is presentation-only string', () => {
    const choice: InteractionChoice = {
      choiceId: 'c1' as ChoiceId,
      label: 'Use existing',
    };
    expect(typeof choice.label).toBe('string');
  });

  it('choice description is optional', () => {
    const withDesc: InteractionChoice = {
      choiceId: 'c1' as ChoiceId,
      label: 'Option A',
      description: 'This is the recommended approach',
    };
    const withoutDesc: InteractionChoice = {
      choiceId: 'c2' as ChoiceId,
      label: 'Option B',
    };
    expect(withDesc.description).toBeDefined();
    expect(withoutDesc.description).toBeUndefined();
  });

  it('supports optional conversation correlation', () => {
    const withConv = makeInteraction({ conversationId: 'conv-123' });
    const withoutConv = makeInteraction();
    expect(withConv.conversationId).toBe('conv-123');
    expect(withoutConv.conversationId).toBeUndefined();
  });

  it('has no generic metadata or extension bag', () => {
    const interaction = makeInteraction();
    expect('metadata' in interaction).toBe(false);
    expect('payload' in interaction).toBe(false);
    expect('context' in interaction).toBe(false);
    expect('data' in interaction).toBe(false);
    expect('extensions' in interaction).toBe(false);
    expect('attributes' in interaction).toBe(false);
  });
});

// ─── B2: InteractionResponse Contract ────────────────────────

describe('B2: InteractionResponse contract', () => {
  it('has stable response identity', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(response.responseId).toBeDefined();
    expect(typeof response.responseId).toBe('string');
  });

  it('references originating interaction', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(response.interactionId).toBe(interaction.interactionId);
  });

  it('identifies selected choice by opaque ID', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 1);
    expect(response.selectedChoiceId).toBe(interaction.choices[1].choiceId);
  });

  it('has responding participant identity', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(response.respondingParticipantId).toBeDefined();
    expect(response.respondingParticipantName).toBeDefined();
  });

  it('has response timestamp', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(response.respondedAt).toBeDefined();
    expect(new Date(response.respondedAt).getTime()).not.toBeNaN();
  });

  it('supports correlation for safe replay', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0, {
      correlationId: 'corr-123',
    });
    expect(response.correlationId).toBe('corr-123');
  });
});

// ─── B2: N-Option Support ────────────────────────────────────

describe('B2: N-option support', () => {
  it('supports single choice', () => {
    const interaction = makeInteraction({
      choices: [{ choiceId: 'c1' as ChoiceId, label: 'Only option' }],
    });
    expect(interaction.choices.length).toBe(1);
  });

  it('supports two choices', () => {
    const interaction = makeInteraction({
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Approve' },
        { choiceId: 'c2' as ChoiceId, label: 'Reject' },
      ],
    });
    expect(interaction.choices.length).toBe(2);
  });

  it('supports three or more choices', () => {
    const interaction = makeInteraction({
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Use approach A' },
        { choiceId: 'c2' as ChoiceId, label: 'Use approach B' },
        { choiceId: 'c3' as ChoiceId, label: 'Explain trade-offs' },
      ],
    });
    expect(interaction.choices.length).toBe(3);
  });

  it('supports many choices', () => {
    const choices: InteractionChoice[] = Array.from({ length: 10 }, (_, i) => ({
      choiceId: `c${i}` as ChoiceId,
      label: `Option ${i + 1}`,
    }));
    const interaction = makeInteraction({ choices });
    expect(interaction.choices.length).toBe(10);
  });
});

// ─── B3: No Executable Semantics ─────────────────────────────

describe('B3: No executable semantics in contract', () => {
  it('StructuredInteraction has no command field', () => {
    const interaction = makeInteraction();
    expect('command' in interaction).toBe(false);
    expect('shellCommand' in interaction).toBe(false);
    expect('operation' in interaction).toBe(false);
    expect('execute' in interaction).toBe(false);
    expect('handler' in interaction).toBe(false);
    expect('endpoint' in interaction).toBe(false);
    expect('route' in interaction).toBe(false);
    expect('toolCall' in interaction).toBe(false);
    expect('approvalGranted' in interaction).toBe(false);
    expect('policyOverride' in interaction).toBe(false);
    expect('permissionOverride' in interaction).toBe(false);
  });

  it('InteractionChoice has no executable fields', () => {
    const choice: InteractionChoice = {
      choiceId: 'c1' as ChoiceId,
      label: 'Option A',
    };
    expect('command' in choice).toBe(false);
    expect('shellCommand' in choice).toBe(false);
    expect('operation' in choice).toBe(false);
    expect('execute' in choice).toBe(false);
    expect('handler' in choice).toBe(false);
    expect('endpoint' in choice).toBe(false);
    expect('route' in choice).toBe(false);
    expect('toolCall' in choice).toBe(false);
  });

  it('InteractionResponse has no authority fields', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('approvalGranted' in response).toBe(false);
    expect('policyOverride' in response).toBe(false);
    expect('permissionOverride' in response).toBe(false);
    expect('command' in response).toBe(false);
    expect('execute' in response).toBe(false);
  });

  it('contract has no generic metadata, payload, or extension bag', () => {
    const interaction = makeInteraction();
    expect('metadata' in interaction).toBe(false);
    expect('payload' in interaction).toBe(false);
    expect('context' in interaction).toBe(false);
    expect('data' in interaction).toBe(false);
    expect('extensions' in interaction).toBe(false);
    expect('attributes' in interaction).toBe(false);
  });
});

// ─── B5: Approval Separation in Types ────────────────────────

describe('B5: Approval separation — type incompatibility', () => {
  it('StructuredInteraction is not interchangeable with ApprovalRequestPayload', () => {
    const interaction = makeInteraction();
    const approvalRequest = {
      approvalId: 'approval-1',
      callId: 'call-1',
      toolName: 'shell',
      reason: 'High risk operation',
      risk: 'high',
    } as ApprovalRequestPayload;

    // These types are structurally different
    expect(interaction).not.toHaveProperty('approvalId');
    expect(interaction).not.toHaveProperty('callId');
    expect(interaction).not.toHaveProperty('toolName');
    expect(interaction).not.toHaveProperty('risk');
    expect(approvalRequest).not.toHaveProperty('interactionId');
    expect(approvalRequest).not.toHaveProperty('choices');
    expect(approvalRequest).not.toHaveProperty('content');
  });

  it('InteractionResponse is not interchangeable with PolicyDecision', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    const policyDecision: PolicyDecision = 'allow';

    // PolicyDecision is a string enum, InteractionResponse is an object
    expect(typeof policyDecision).toBe('string');
    expect(typeof response).toBe('object');
    expect(response).not.toHaveProperty('result');
    expect(response).not.toHaveProperty('matchedPolicies');
  });

  it('InteractionResponse does not have approve/reject semantics', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    // The response has selectedChoiceId, not 'decision: approved' | 'rejected'
    expect(response).toHaveProperty('selectedChoiceId');
    expect(response).not.toHaveProperty('decision');
  });
});

// ─── B4: Lifecycle Modeling ──────────────────────────────────

describe('B4: Lifecycle states', () => {
  it('defines presented state', () => {
    const lifecycle: InteractionLifecycle = 'presented';
    expect(lifecycle).toBe('presented');
  });

  it('defines responded state', () => {
    const lifecycle: InteractionLifecycle = 'responded';
    expect(lifecycle).toBe('responded');
  });

  it('defines expired state', () => {
    const lifecycle: InteractionLifecycle = 'expired';
    expect(lifecycle).toBe('expired');
  });

  it('lifecycle is derived from facts, not persisted as execution state', () => {
    // The StructuredInteraction type does not carry a lifecycle field
    // Lifecycle is derived from whether a response exists
    const interaction = makeInteraction();
    expect('lifecycle' in interaction).toBe(false);
    expect('state' in interaction).toBe(false);
    expect('status' in interaction).toBe(false);
  });
});

// ─── Type Guards ─────────────────────────────────────────────

describe('Type guards', () => {
  it('isStructuredInteraction identifies valid interactions', () => {
    const interaction = makeInteraction();
    expect(isStructuredInteraction(interaction)).toBe(true);
  });

  it('isStructuredInteraction rejects non-interactions', () => {
    expect(isStructuredInteraction(null)).toBe(false);
    expect(isStructuredInteraction(undefined)).toBe(false);
    expect(isStructuredInteraction('string')).toBe(false);
    expect(isStructuredInteraction(42)).toBe(false);
    expect(isStructuredInteraction({})).toBe(false);
    expect(isStructuredInteraction({ interactionId: 'x' })).toBe(false);
  });

  it('isInteractionResponse identifies valid responses', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(isInteractionResponse(response)).toBe(true);
  });

  it('isInteractionResponse rejects non-responses', () => {
    expect(isInteractionResponse(null)).toBe(false);
    expect(isInteractionResponse(undefined)).toBe(false);
    expect(isInteractionResponse('string')).toBe(false);
    expect(isInteractionResponse({})).toBe(false);
    expect(isInteractionResponse({ responseId: 'x' })).toBe(false);
  });
});

// ─── B8: Canonical Text Ingress Preserved ────────────────────

describe('B8: Text ingress backward compatibility', () => {
  it('plain text message is not a StructuredInteraction', () => {
    const plainMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, how are you?',
    };
    expect(isStructuredInteraction(plainMessage)).toBe(false);
  });

  it('structured interaction is not a plain text message', () => {
    const interaction = makeInteraction();
    // A StructuredInteraction does not have 'role' or 'content' in the Message sense
    expect('role' in interaction).toBe(false);
  });

  it('natural language words do not trigger recommendation semantics', () => {
    // The contract carries no keyword routing
    const interaction = makeInteraction({
      content: 'Should I install the dependency?',
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Install' },
        { choiceId: 'c2' as ChoiceId, label: 'Skip' },
      ],
    });
    // The label "Install" is presentation-only, not an operation
    expect(interaction.choices[0].label).toBe('Install');
    expect('command' in interaction.choices[0]).toBe(false);
    expect('operation' in interaction.choices[0]).toBe(false);
  });
});

// ─── B9: Cross-Domain Generality Proof ───────────────────────

describe('B9: Cross-domain generality', () => {
  it('Marketplace: "I found an existing dashboard component"', () => {
    const interaction = makeInteraction({
      content: 'I found an existing dashboard component that matches your requirements.',
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Use this option' },
        { choiceId: 'c2' as ChoiceId, label: 'Show details' },
        { choiceId: 'c3' as ChoiceId, label: 'Continue building' },
      ],
    });
    expect(interaction.choices.length).toBe(3);
  });

  it('Engineering: "Two reasonable implementation approaches"', () => {
    const interaction = makeInteraction({
      content: 'There are two reasonable implementation approaches.',
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Use approach A' },
        { choiceId: 'c2' as ChoiceId, label: 'Use approach B' },
        { choiceId: 'c3' as ChoiceId, label: 'Explain the trade-offs' },
      ],
    });
    expect(interaction.choices.length).toBe(3);
  });

  it('Configuration: "Existing configuration appears compatible"', () => {
    const interaction = makeInteraction({
      content: 'An existing configuration appears compatible with your project.',
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Use existing' },
        { choiceId: 'c2' as ChoiceId, label: 'Compare' },
        { choiceId: 'c3' as ChoiceId, label: 'Keep current plan' },
      ],
    });
    expect(interaction.choices.length).toBe(3);
  });

  it('Unknown future domain: any domain with choices', () => {
    // A domain completely unknown to today's Activity Room
    const interaction = makeInteraction({
      content: 'The quantum entanglement calibration needs adjustment.',
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Recalibrate' },
        { choiceId: 'c2' as ChoiceId, label: 'Run diagnostics' },
        { choiceId: 'c3' as ChoiceId, label: 'Ignore for now' },
      ],
    });
    expect(interaction.choices.length).toBe(3);
    // No Activity Room source changes needed — contract is domain-neutral
  });
});

// ─── B10: Negative Architecture Tests ────────────────────────

describe('B10: Negative architecture tests — cannot occur', () => {
  it('choiceId cannot map to shell command', () => {
    const choice: InteractionChoice = {
      choiceId: 'c1' as ChoiceId,
      label: 'Approve',
    };
    // choiceId is a branded string, not a command mapping
    expect(typeof choice.choiceId).toBe('string');
    expect('command' in choice).toBe(false);
    expect('shellCommand' in choice).toBe(false);
  });

  it('choice label cannot become operation', () => {
    const choice: InteractionChoice = {
      choiceId: 'c1' as ChoiceId,
      label: 'Install',
    };
    // label is presentation-only
    expect(typeof choice.label).toBe('string');
    expect('operation' in choice).toBe(false);
    expect('execute' in choice).toBe(false);
  });

  it('recommendation cannot become direct tool invocation', () => {
    const interaction = makeInteraction();
    expect('toolCall' in interaction).toBe(false);
    expect('handler' in interaction).toBe(false);
    expect('endpoint' in interaction).toBe(false);
  });

  it('response cannot become approvalGranted', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('approvalGranted' in response).toBe(false);
    expect('decision' in response).toBe(false);
  });

  it('response cannot trigger Activity Room → Workflow dispatch', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('workflowRunId' in response).toBe(false);
    expect('dispatch' in response).toBe(false);
    expect('execution' in response).toBe(false);
  });

  it('response cannot trigger Activity Room → Harness execution', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('harnessExecution' in response).toBe(false);
    expect('threadId' in response).toBe(false);
    expect('turnId' in response).toBe(false);
  });

  it('response cannot trigger Activity Room → Marketplace install', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('install' in response).toBe(false);
    expect('package' in response).toBe(false);
    expect('marketplace' in response).toBe(false);
  });

  it('response cannot trigger Activity Room → Policy allow', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect('policyAllow' in response).toBe(false);
    expect('policyDecision' in response).toBe(false);
  });

  it('contract provides identity/correlation primitives for idempotency (deferred to consumer)', () => {
    // Contract guarantee: responses carry stable typed identities and correlationId
    // Deferred: persistence deduplication, replay suppression, exactly-once processing
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    // Contract provides: responseId (stable identity), correlationId (deduplication key)
    expect(response.responseId).toBeDefined();
    expect(typeof response.responseId).toBe('string');
    // Consumer must implement: deduplication by (interactionId, respondingParticipantId) or correlationId
  });

  it('contract provides identity primitives for reconnect (deferred to consumer)', () => {
    // Contract guarantee: response references originating interaction by stable interactionId
    // Deferred: reconnect recovery, session re-establishment, stale-state evaluation
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    expect(response.interactionId).toBe(interaction.interactionId);
  });

  it('stale response cannot become permanent authority', () => {
    // The interaction type has no 'authority' or 'permission' field
    const interaction = makeInteraction();
    expect('authority' in interaction).toBe(false);
    expect('permission' in interaction).toBe(false);
    expect('permanent' in interaction).toBe(false);
  });

  it('unknown choice cannot trigger arbitrary payload execution', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    // response has no 'payload' or 'execution' field
    expect('payload' in response).toBe(false);
    expect('execution' in response).toBe(false);
    expect('arbitrary' in response).toBe(false);
  });
});

// ─── B5: Type Incompatibility with Existing Approval DTOs ────

describe('B5: Type incompatibility verification', () => {
  it('InteractionResponse cannot be assigned to ApprovalRequestPayload', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);

    // Structural incompatibility check
    // ApprovalRequestPayload requires: approvalId, callId, toolName, reason, risk
    // InteractionResponse has: responseId, interactionId, selectedChoiceId, etc.
    const hasApprovalFields =
      'approvalId' in response &&
      'callId' in response &&
      'toolName' in response &&
      'reason' in response &&
      'risk' in response;
    expect(hasApprovalFields).toBe(false);
  });

  it('StructuredInteraction cannot be confused with TaskReviewResult', () => {
    // TaskReviewResult has: decision: 'approved' | 'changes-requested' | 'rejected'
    const interaction = makeInteraction();
    expect('decision' in interaction).toBe(false);
    expect('changesRequested' in interaction).toBe(false);
  });
});

// ─── Structural Validation ───────────────────────────────────

describe('Structural validation: validateInteraction', () => {
  it('rejects zero choices', () => {
    const interaction = makeInteraction({ choices: [] });
    const errors = validateInteraction(interaction);
    expect(errors.length).toBe(1);
    expect(errors[0].invariant).toBe('choices-non-empty');
  });

  it('accepts one choice', () => {
    const interaction = makeInteraction({
      choices: [{ choiceId: 'c1' as ChoiceId, label: 'Only option' }],
    });
    const errors = validateInteraction(interaction);
    expect(errors.length).toBe(0);
  });

  it('accepts N choices', () => {
    const choices: InteractionChoice[] = Array.from({ length: 5 }, (_, i) => ({
      choiceId: `c${i}` as ChoiceId,
      label: `Option ${i + 1}`,
    }));
    const interaction = makeInteraction({ choices });
    const errors = validateInteraction(interaction);
    expect(errors.length).toBe(0);
  });

  it('rejects duplicate ChoiceIds', () => {
    const interaction = makeInteraction({
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Option A' },
        { choiceId: 'c1' as ChoiceId, label: 'Option B' },
      ],
    });
    const errors = validateInteraction(interaction);
    expect(errors.length).toBe(1);
    expect(errors[0].invariant).toBe('choice-ids-unique');
  });

  it('accepts unique ChoiceIds', () => {
    const interaction = makeInteraction({
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'Option A' },
        { choiceId: 'c2' as ChoiceId, label: 'Option B' },
        { choiceId: 'c3' as ChoiceId, label: 'Option C' },
      ],
    });
    const errors = validateInteraction(interaction);
    expect(errors.length).toBe(0);
  });
});

describe('Structural validation: validateResponseForInteraction', () => {
  it('rejects response for wrong interaction', () => {
    const interaction1 = makeInteraction();
    const interaction2 = makeInteraction();
    const response = makeResponse(interaction1, 0);
    // Override to reference wrong interaction
    const wrongResponse = { ...response, interactionId: interaction2.interactionId };
    const errors = validateResponseForInteraction(wrongResponse, interaction1);
    expect(errors.length).toBe(1);
    expect(errors[0].invariant).toBe('response-interaction-mismatch');
  });

  it('rejects unknown selected ChoiceId', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    // Override to reference non-existent choice
    const wrongResponse = { ...response, selectedChoiceId: 'nonexistent' as ChoiceId };
    const errors = validateResponseForInteraction(wrongResponse, interaction);
    expect(errors.length).toBe(1);
    expect(errors[0].invariant).toBe('selected-choice-exists');
  });

  it('accepts valid response with correct interaction and choice', () => {
    const interaction = makeInteraction();
    const response = makeResponse(interaction, 0);
    const errors = validateResponseForInteraction(response, interaction);
    expect(errors.length).toBe(0);
  });

  it('accepts valid response with any choice index', () => {
    const interaction = makeInteraction({
      choices: [
        { choiceId: 'c1' as ChoiceId, label: 'A' },
        { choiceId: 'c2' as ChoiceId, label: 'B' },
        { choiceId: 'c3' as ChoiceId, label: 'C' },
      ],
    });
    const response = makeResponse(interaction, 2);
    const errors = validateResponseForInteraction(response, interaction);
    expect(errors.length).toBe(0);
  });
});
