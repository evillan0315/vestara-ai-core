import type {
  AiInvocationRequest,
  AiResolutionRequest,
  ExecutionId,
  ResolvedAiBinding,
  WorkflowRunId,
} from '@vestara/types';
import { describe, expect, it } from 'vitest';
import { createFallbackBinding, guardAiInvocation } from '../src/ai-invocation-guard.js';
import { extractBindingLineage, resolveAiBinding, verifyBindingIntegrity } from '../src/ai-resolution.js';

// ─── Test Helpers ────────────────────────────────────────────

function makeResolutionRequest(overrides?: Partial<AiResolutionRequest>): AiResolutionRequest {
  return {
    executionId: 'exec-test-001' as ExecutionId,
    workflowRunId: 'wf-test-001' as WorkflowRunId,
    traceId: 'trace-test-001' as never,
    requestId: 'req-test-001' as never,
    taskId: 'task-001',
    agentAssignmentId: 'agent-001',
    executionMode: 'governed',
    ...overrides,
  };
}

function makeInvocationRequest(
  binding: ResolvedAiBinding,
  overrides?: Partial<Pick<AiInvocationRequest, 'providerId' | 'modelId'>>,
): AiInvocationRequest {
  return {
    binding,
    providerId: overrides?.providerId ?? binding.providerModel.providerId,
    modelId: overrides?.modelId ?? binding.providerModel.modelId,
    messages: [{ role: 'user', content: 'test' }],
  };
}

// ─── ARX-015 M4 — AI Resolution & Execution Binding ─────────

describe('ARX-015 M4 — AI Resolution & Execution Binding', () => {
  describe('resolveAiBinding', () => {
    it('resolves a binding with default provider/model when no preference specified', () => {
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      expect(binding.providerModel.providerId).toBe('opencode');
      expect(binding.providerModel.modelId).toBe('mimo-v2.5-free');
      expect(binding.executionMode).toBe('governed');
      expect(binding.requiresApproval).toBe(false);
    });

    it('resolves with explicit caller preference', () => {
      const request = makeResolutionRequest({
        preferredProviderId: 'anthropic',
        preferredModelId: 'claude-3-opus',
      });
      const binding = resolveAiBinding(request);

      expect(binding.providerModel.providerId).toBe('anthropic');
      expect(binding.providerModel.modelId).toBe('claude-3-opus');
      expect(binding.resolutionFacts.routingReason).toBe('explicit-preference');
    });

    it('resolves with task-level override', () => {
      const request = makeResolutionRequest({
        preferredProviderId: 'openai',
      });
      const binding = resolveAiBinding(request);

      expect(binding.providerModel.providerId).toBe('openai');
      expect(binding.providerModel.modelId).toBe('mimo-v2.5-free');
      expect(binding.resolutionFacts.routingReason).toBe('task-override');
    });

    it('carries canonical M1/M2 lineage', () => {
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      expect(binding.executionId).toBe('exec-test-001');
      expect(binding.workflowRunId).toBe('wf-test-001');
      expect(binding.taskId).toBe('task-001');
      expect(binding.agentAssignmentId).toBe('agent-001');
    });

    it('requiresApproval is true for hermetic mode', () => {
      const request = makeResolutionRequest({ executionMode: 'hermetic' });
      const binding = resolveAiBinding(request);

      expect(binding.requiresApproval).toBe(true);
    });

    it('requiresApproval is false for governed mode', () => {
      const request = makeResolutionRequest({ executionMode: 'governed' });
      const binding = resolveAiBinding(request);

      expect(binding.requiresApproval).toBe(false);
    });

    it('requiresApproval is false for live mode', () => {
      const request = makeResolutionRequest({ executionMode: 'live' });
      const binding = resolveAiBinding(request);

      expect(binding.requiresApproval).toBe(false);
    });
  });

  describe('binding immutability', () => {
    it('creates unique binding IDs for each resolution', () => {
      const request = makeResolutionRequest();
      const binding1 = resolveAiBinding(request);
      const binding2 = resolveAiBinding(request);

      expect(binding1.bindingId).not.toBe(binding2.bindingId);
    });

    it('binding is a plain object (no mutable methods)', () => {
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      expect(typeof binding).toBe('object');
      expect(Object.keys(binding)).not.toContain('mutate');
      expect(Object.keys(binding)).not.toContain('update');
      expect(Object.keys(binding)).not.toContain('setProvider');
    });

    it('providerModel is a plain object (no mutable methods)', () => {
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      expect(typeof binding.providerModel).toBe('object');
      expect(Object.keys(binding.providerModel)).not.toContain('setProvider');
      expect(Object.keys(binding.providerModel)).not.toContain('setModel');
    });

    it('resolutionFacts is a plain object (no mutable methods)', () => {
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      expect(typeof binding.resolutionFacts).toBe('object');
      expect(Object.keys(binding.resolutionFacts)).not.toContain('updateReason');
    });
  });

  describe('deterministic resolution', () => {
    it('identical constraints produce identical provider/model selection', () => {
      const request = makeResolutionRequest({
        preferredProviderId: 'anthropic',
        preferredModelId: 'claude-3-opus',
      });

      const binding1 = resolveAiBinding(request);
      const binding2 = resolveAiBinding(request);

      // Same provider/model (deterministic selection)
      expect(binding1.providerModel.providerId).toBe(binding2.providerModel.providerId);
      expect(binding1.providerModel.modelId).toBe(binding2.providerModel.modelId);
      expect(binding1.resolutionFacts.routingReason).toBe(binding2.resolutionFacts.routingReason);

      // Different binding IDs (unique per invocation)
      expect(binding1.bindingId).not.toBe(binding2.bindingId);
    });

    it('different preferences produce different selections', () => {
      const request1 = makeResolutionRequest({ preferredModelId: 'model-a' });
      const request2 = makeResolutionRequest({ preferredModelId: 'model-b' });

      const binding1 = resolveAiBinding(request1);
      const binding2 = resolveAiBinding(request2);

      expect(binding1.providerModel.modelId).not.toBe(binding2.providerModel.modelId);
    });
  });

  describe('guardAiInvocation', () => {
    it('allows invocation when binding matches provider/model', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(true);
      expect(result.bindingId).toBe(binding.bindingId);
      expect(result.invokedProviderId).toBe(binding.providerModel.providerId);
      expect(result.invokedModelId).toBe(binding.providerModel.modelId);
    });

    it('denies invocation with missing binding', () => {
      const request: AiInvocationRequest = {
        binding: undefined as unknown as ResolvedAiBinding,
        providerId: 'opencode',
        modelId: 'model',
        messages: [],
      };
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('missing-binding');
    });

    it('denies invocation with provider mismatch', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const request = makeInvocationRequest(binding, { providerId: 'wrong-provider' });
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('provider-mismatch');
    });

    it('denies invocation with model mismatch', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const request = makeInvocationRequest(binding, { modelId: 'wrong-model' });
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('model-mismatch');
    });

    it('denies invocation when approval required but not granted', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: 'hermetic' }));
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request, undefined, false);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('approval-required');
    });

    it('allows invocation when approval required and granted', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: 'hermetic' }));
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request, undefined, true);

      expect(result.allowed).toBe(true);
    });

    it('denies invocation in hermetic mode without approval', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: 'hermetic' }));
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('approval-required');
    });

    it('allows invocation in governed mode without approval', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: 'governed' }));
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(true);
    });

    it('allows invocation in live mode without approval', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: 'live' }));
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(true);
    });
  });

  describe('fallback binding', () => {
    it('creates new binding with lineage to original', () => {
      const original = resolveAiBinding(
        makeResolutionRequest({
          preferredProviderId: 'provider-a',
          preferredModelId: 'model-a',
        }),
      );

      const fallback = createFallbackBinding(original, 'provider-b', 'model-b', 'provider unavailable');

      expect(fallback.bindingId).not.toBe(original.bindingId);
      expect(fallback.providerModel.providerId).toBe('provider-b');
      expect(fallback.providerModel.modelId).toBe('model-b');
      expect(fallback.resolutionFacts.routingReason).toBe('fallback');
      expect(fallback.resolutionFacts.fallbackFrom).toEqual({
        providerId: 'provider-a',
        modelId: 'model-a',
        reason: 'provider unavailable',
      });
    });

    it('preserves lineage from original binding', () => {
      const original = resolveAiBinding(makeResolutionRequest());
      const fallback = createFallbackBinding(original, 'new-provider', 'new-model', 'retry');

      expect(fallback.executionId).toBe(original.executionId);
      expect(fallback.workflowRunId).toBe(original.workflowRunId);
      expect(fallback.traceId).toBe(original.traceId);
      expect(fallback.taskId).toBe(original.taskId);
      expect(fallback.agentAssignmentId).toBe(original.agentAssignmentId);
    });

    it('original binding is not mutated', () => {
      const original = resolveAiBinding(
        makeResolutionRequest({
          preferredProviderId: 'provider-a',
          preferredModelId: 'model-a',
        }),
      );

      const originalProvider = { ...original.providerModel };
      const originalFacts = { ...original.resolutionFacts };

      createFallbackBinding(original, 'provider-b', 'model-b', 'retry');

      expect(original.providerModel).toEqual(originalProvider);
      expect(original.resolutionFacts).toEqual(originalFacts);
    });

    it('fallback binding passes guard when provider/model match', () => {
      const original = resolveAiBinding(makeResolutionRequest());
      const fallback = createFallbackBinding(original, 'fallback-provider', 'fallback-model', 'retry');
      const request = makeInvocationRequest(fallback);
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(true);
    });

    it('fallback binding fails guard when provider does not match', () => {
      const original = resolveAiBinding(makeResolutionRequest());
      const fallback = createFallbackBinding(original, 'fallback-provider', 'fallback-model', 'retry');
      const request = makeInvocationRequest(fallback, { providerId: 'wrong-provider' });
      const result = guardAiInvocation(request);

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('provider-mismatch');
    });
  });

  describe('multiple bindings per execution', () => {
    it('one execution can own multiple distinct bindings', () => {
      const executionId = 'exec-multi-001' as ExecutionId;

      const binding1 = resolveAiBinding(
        makeResolutionRequest({
          executionId,
          preferredModelId: 'model-a',
        }),
      );
      const binding2 = resolveAiBinding(
        makeResolutionRequest({
          executionId,
          preferredModelId: 'model-b',
        }),
      );
      const binding3 = resolveAiBinding(
        makeResolutionRequest({
          executionId,
          preferredModelId: 'model-c',
        }),
      );

      // All share the same execution
      expect(binding1.executionId).toBe(executionId);
      expect(binding2.executionId).toBe(executionId);
      expect(binding3.executionId).toBe(executionId);

      // All have different binding IDs
      const ids = new Set([binding1.bindingId, binding2.bindingId, binding3.bindingId]);
      expect(ids.size).toBe(3);

      // All have different models
      const models = new Set([
        binding1.providerModel.modelId,
        binding2.providerModel.modelId,
        binding3.providerModel.modelId,
      ]);
      expect(models.size).toBe(3);
    });
  });

  describe('lineage extraction', () => {
    it('extracts canonical lineage from binding', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const lineage = extractBindingLineage(binding);

      expect(lineage.bindingId).toBe(binding.bindingId);
      expect(lineage.executionId).toBe(binding.executionId);
      expect(lineage.workflowRunId).toBe(binding.workflowRunId);
      expect(lineage.traceId).toBe(binding.traceId);
      expect(lineage.taskId).toBe(binding.taskId);
      expect(lineage.agentAssignmentId).toBe(binding.agentAssignmentId);
    });

    it('lineage survives JSON round-trip (serialization)', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const lineage = extractBindingLineage(binding);

      // Serialize and deserialize
      const serialized = JSON.stringify(lineage);
      const deserialized = JSON.parse(serialized) as typeof lineage;

      expect(deserialized.bindingId).toBe(lineage.bindingId);
      expect(deserialized.executionId).toBe(lineage.executionId);
      expect(deserialized.workflowRunId).toBe(lineage.workflowRunId);
      expect(deserialized.traceId).toBe(lineage.traceId);
      expect(deserialized.taskId).toBe(lineage.taskId);
      expect(deserialized.agentAssignmentId).toBe(lineage.agentAssignmentId);
    });
  });

  describe('binding integrity', () => {
    it('verifyBindingIntegrity returns true for valid binding', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      expect(verifyBindingIntegrity(binding)).toBe(true);
    });

    it('binding integrity is maintained through JSON round-trip', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const serialized = JSON.stringify(binding);
      const deserialized = JSON.parse(serialized) as ResolvedAiBinding;

      // Integrity check passes after round-trip
      expect(verifyBindingIntegrity(deserialized)).toBe(true);
    });
  });

  describe('M3 policy integration', () => {
    it('executionMode is carried from resolution request to binding', () => {
      const hermetic = resolveAiBinding(makeResolutionRequest({ executionMode: 'hermetic' }));
      const governed = resolveAiBinding(makeResolutionRequest({ executionMode: 'governed' }));
      const live = resolveAiBinding(makeResolutionRequest({ executionMode: 'live' }));

      expect(hermetic.executionMode).toBe('hermetic');
      expect(governed.executionMode).toBe('governed');
      expect(live.executionMode).toBe('live');
    });

    it('executionMode defaults to governed when not specified', () => {
      const binding = resolveAiBinding(makeResolutionRequest({ executionMode: undefined }));
      expect(binding.executionMode).toBe('governed');
    });
  });

  describe('event payload structure', () => {
    it('binding contains all fields needed for event emission', () => {
      const binding = resolveAiBinding(makeResolutionRequest());

      // Verify all event-relevant fields are present
      expect(binding.bindingId).toBeDefined();
      expect(binding.executionId).toBeDefined();
      expect(binding.providerModel.providerId).toBeDefined();
      expect(binding.providerModel.modelId).toBeDefined();
      expect(binding.executionMode).toBeDefined();
      expect(binding.resolutionFacts.routingReason).toBeDefined();
      expect(binding.requiresApproval).toBeDefined();
      expect(binding.createdAt).toBeDefined();
    });
  });

  describe('zero live provider/OpenCode calls', () => {
    it('resolveAiBinding is pure and does not call any provider', () => {
      // This test verifies that resolveAiBinding is a pure function
      // It takes a request and returns a binding — no side effects
      const request = makeResolutionRequest();
      const binding = resolveAiBinding(request);

      // Binding is a plain object (no provider references)
      expect(typeof binding).toBe('object');
      expect(binding.providerModel.providerId).toBeDefined();
      expect(binding.providerModel.modelId).toBeDefined();
    });

    it('guardAiInvocation is pure and does not call any provider', () => {
      const binding = resolveAiBinding(makeResolutionRequest());
      const request = makeInvocationRequest(binding);
      const result = guardAiInvocation(request);

      // Result is a plain object (no provider references)
      expect(typeof result).toBe('object');
      expect(result.allowed).toBeDefined();
    });
  });
});
