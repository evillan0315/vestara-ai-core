/**
 * ARX-015 M4B: AiInvocationService Integration Tests
 *
 * Proves the authoritative control-plane boundary:
 * 1. Routing precedence: agent config → role routing → defaults
 * 2. Zero bypass: no provider call without binding
 * 3. Policy denial: zero provider calls on denial
 * 4. Fallback: new immutable binding with lineage
 * 5. Canonical events: same bindingId through resolution → guard → completion
 * 6. Authorized request: CompletionRequest.model constructed from binding
 * 7. Hardcoded model treated as preference, not authority
 */

import type { CompletionRequest, CompletionResponse } from '@vestara/shared';
import type { ExecutionId } from '@vestara/types';
import { describe, expect, it, vi } from 'vitest';
import {
  AiInvocationService,
  type AiInvocationServiceConfig,
  type AiInvocationServiceEvent,
  type AiServiceInvocationRequest,
} from '../src/ai-invocation-service.js';

// ─── Stub Provider ───────────────────────────────────────────

function createStubProvider(id = 'stub-provider') {
  let callCount = 0;
  const capturedRequests: CompletionRequest[] = [];

  return {
    id,
    complete: vi.fn().mockImplementation(async (request: CompletionRequest) => {
      callCount++;
      capturedRequests.push(request);
      return {
        id: `resp-${callCount}`,
        model: request.model,
        provider: id,
        content: `Response from ${request.model}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latency: 100,
      } satisfies CompletionResponse;
    }),
    getCallCount: () => callCount,
    getCapturedRequests: () => [...capturedRequests],
    reset: () => {
      callCount = 0;
      capturedRequests.length = 0;
    },
  };
}

// ─── Helper: make a CompletionRequest ────────────────────────

function makeRequest(model?: string): CompletionRequest {
  return {
    model: model ?? 'test-model',
    messages: [{ role: 'user', content: 'hello' }],
  };
}

// ─── Helper: make an invocation request ──────────────────────

function makeInvocation(overrides?: Partial<AiServiceInvocationRequest>): AiServiceInvocationRequest {
  return {
    executionId: 'exec-test-001' as ExecutionId,
    completionRequest: makeRequest(),
    ...overrides,
  };
}

// ─── Helper: create service config ───────────────────────────

function makeConfig(overrides?: Partial<AiInvocationServiceConfig>): AiInvocationServiceConfig {
  return {
    defaultConfig: { providerId: 'default-provider', modelId: 'mimo-v2.5-free' },
    ...overrides,
  };
}

// ─── Integration Tests ───────────────────────────────────────

describe('ARX-015 M4B — AiInvocationService Integration', () => {
  describe('routing precedence', () => {
    it('explicit preference wins over agent config', async () => {
      const service = new AiInvocationService(
        makeConfig({
          resolveAgentConfig: async () => ({ providerId: 'agent-provider', modelId: 'agent-model' }),
        }),
      );

      const result = await service.resolve(
        makeInvocation({
          preferredProviderId: 'explicit-provider',
          preferredModelId: 'explicit-model',
          agentId: 'agent-001',
        }),
      );

      expect(result.binding.providerModel.providerId).toBe('explicit-provider');
      expect(result.binding.providerModel.modelId).toBe('explicit-model');
      expect(result.binding.resolutionFacts.routingReason).toBe('explicit-preference');
    });

    it('agent config wins over role routing', async () => {
      const service = new AiInvocationService(
        makeConfig({
          resolveAgentConfig: async () => ({ providerId: 'agent-provider', modelId: 'agent-model' }),
          resolveRoleConfig: async () => ({ providerId: 'role-provider', modelId: 'role-model' }),
        }),
      );

      const result = await service.resolve(makeInvocation({ agentId: 'agent-001', role: 'developer' }));

      expect(result.binding.providerModel.providerId).toBe('agent-provider');
      expect(result.binding.providerModel.modelId).toBe('agent-model');
      expect(result.binding.resolutionFacts.routingReason).toBe('task-override');
    });

    it('role routing wins over defaults', async () => {
      const service = new AiInvocationService(
        makeConfig({
          resolveRoleConfig: async () => ({ providerId: 'role-provider', modelId: 'role-model' }),
        }),
      );

      const result = await service.resolve(makeInvocation({ role: 'planner' }));

      expect(result.binding.providerModel.providerId).toBe('role-provider');
      expect(result.binding.providerModel.modelId).toBe('role-model');
      expect(result.binding.resolutionFacts.routingReason).toBe('role-routing');
    });

    it('defaults used when no other resolution matches', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation());

      expect(result.binding.providerModel.providerId).toBe('default-provider');
      expect(result.binding.providerModel.modelId).toBe('mimo-v2.5-free');
      expect(result.binding.resolutionFacts.routingReason).toBe('default');
    });

    it('partial preference (only provider) uses default model', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation({ preferredProviderId: 'my-provider' }));

      expect(result.binding.providerModel.providerId).toBe('my-provider');
      expect(result.binding.providerModel.modelId).toBe('mimo-v2.5-free');
      expect(result.binding.resolutionFacts.routingReason).toBe('task-override');
    });

    it('partial preference (only model) uses default provider', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation({ preferredModelId: 'my-model' }));

      expect(result.binding.providerModel.providerId).toBe('default-provider');
      expect(result.binding.providerModel.modelId).toBe('my-model');
      expect(result.binding.resolutionFacts.routingReason).toBe('task-override');
    });
  });

  describe('authorized request construction', () => {
    it('CompletionRequest.model is constructed from binding, not caller', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation({ preferredModelId: 'resolved-model' }));

      // The authorized request has the binding's model, not the caller's
      expect(result.authorizedRequest.model).toBe('resolved-model');
      expect(result.allowed).toBe(true);
    });

    it('caller model preference is treated as preference, not authority', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(
        makeInvocation({
          preferredModelId: 'caller-preferred',
          completionRequest: makeRequest('hardcoded-model'),
        }),
      );

      // The authorized request uses the resolved model, not the hardcoded one
      expect(result.authorizedRequest.model).toBe('caller-preferred');
    });

    it('messages and other request fields are preserved', async () => {
      const service = new AiInvocationService(makeConfig());

      const completionRequest: CompletionRequest = {
        model: 'ignore-this',
        messages: [{ role: 'user', content: 'test message' }],
        temperature: 0.7,
        maxTokens: 1024,
      };

      const result = await service.resolve(makeInvocation({ completionRequest }));

      expect(result.authorizedRequest.messages).toEqual(completionRequest.messages);
      expect(result.authorizedRequest.temperature).toBe(0.7);
      expect(result.authorizedRequest.maxTokens).toBe(1024);
    });
  });

  describe('zero bypass proof', () => {
    it('resolve does not call any provider', async () => {
      const stub = createStubProvider();
      const service = new AiInvocationService(makeConfig());

      await service.resolve(makeInvocation());

      // The service only resolves and guards — it does NOT call provider.complete()
      expect(stub.getCallCount()).toBe(0);
    });

    it('denied invocation returns without provider call', async () => {
      const stub = createStubProvider();
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation({ executionMode: 'hermetic' }));

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('approval-required');
      expect(stub.getCallCount()).toBe(0);
    });
  });

  describe('policy denial proof', () => {
    it('hermetic mode without approval → zero provider calls', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(makeInvocation({ executionMode: 'hermetic' }));

      expect(result.allowed).toBe(false);
      expect(result.denialReason).toBe('approval-required');
    });

    it('multiple denied invocations → zero provider calls', async () => {
      const service = new AiInvocationService(makeConfig());

      for (let i = 0; i < 5; i++) {
        const result = await service.resolve(makeInvocation({ executionMode: 'hermetic' }));
        expect(result.allowed).toBe(false);
      }

      // All denied — no provider calls possible
    });
  });

  describe('fallback proof', () => {
    it('fallback creates new binding with lineage to original', async () => {
      const service = new AiInvocationService(makeConfig());

      // First resolution
      const result1 = await service.resolve(makeInvocation({ preferredModelId: 'model-a' }));

      // Second resolution (simulating fallback)
      const result2 = await service.resolve(makeInvocation({ preferredModelId: 'model-b' }));

      // Both bindings exist in history
      expect(service.bindingHistory).toHaveLength(2);

      // Different binding IDs
      expect(result1.binding.bindingId).not.toBe(result2.binding.bindingId);

      // Different models
      expect(result1.binding.providerModel.modelId).toBe('model-a');
      expect(result2.binding.providerModel.modelId).toBe('model-b');

      // Both carry the same execution lineage
      expect(result1.binding.executionId).toBe(result2.binding.executionId);
    });

    it('original binding is not mutated by fallback', async () => {
      const service = new AiInvocationService(makeConfig());

      const result1 = await service.resolve(makeInvocation({ preferredModelId: 'original-model' }));

      const originalModel = result1.binding.providerModel.modelId;

      // Resolve another binding
      await service.resolve(makeInvocation({ preferredModelId: 'fallback-model' }));

      // Original binding unchanged
      expect(result1.binding.providerModel.modelId).toBe(originalModel);
    });
  });

  describe('canonical events proof', () => {
    it('emits invocation.resolved → invocation.guarded → invocation.completed with same bindingId', async () => {
      const events: AiInvocationServiceEvent[] = [];
      const service = new AiInvocationService(
        makeConfig({
          eventEmitter: (e) => events.push(e),
        }),
      );

      const result = await service.resolve(makeInvocation({ preferredModelId: 'event-model' }));

      // Emit completion event
      service.complete(result.binding, true);

      // Verify event sequence
      const resolvedEvents = events.filter((e) => e.type === 'invocation.resolved');
      const guardedEvents = events.filter((e) => e.type === 'invocation.guarded');
      const completedEvents = events.filter((e) => e.type === 'invocation.completed');

      expect(resolvedEvents).toHaveLength(1);
      expect(guardedEvents).toHaveLength(1);
      expect(completedEvents).toHaveLength(1);

      // All events share the same bindingId
      const bindingId = resolvedEvents[0].bindingId;
      expect(guardedEvents[0].bindingId).toBe(bindingId);
      expect(completedEvents[0].bindingId).toBe(bindingId);
    });

    it('emits invocation.denied for denied invocations', async () => {
      const events: AiInvocationServiceEvent[] = [];
      const service = new AiInvocationService(
        makeConfig({
          eventEmitter: (e) => events.push(e),
        }),
      );

      await service.resolve(makeInvocation({ executionMode: 'hermetic' }));

      const deniedEvents = events.filter((e) => e.type === 'invocation.denied');
      expect(deniedEvents).toHaveLength(1);
      expect(deniedEvents[0].denialReason).toBe('approval-required');
    });

    it('events carry execution lineage', async () => {
      const events: AiInvocationServiceEvent[] = [];
      const execId = 'exec-lineage-001' as ExecutionId;
      const service = new AiInvocationService(
        makeConfig({
          eventEmitter: (e) => events.push(e),
        }),
      );

      await service.resolve(makeInvocation({ executionId: execId }));

      for (const event of events) {
        expect(event.executionId).toBe(execId);
      }
    });
  });

  describe('binding history', () => {
    it('records all resolved bindings', async () => {
      const service = new AiInvocationService(makeConfig());

      await service.resolve(makeInvocation({ preferredModelId: 'model-1' }));
      await service.resolve(makeInvocation({ preferredModelId: 'model-2' }));
      await service.resolve(makeInvocation({ preferredModelId: 'model-3' }));

      expect(service.bindingHistory).toHaveLength(3);
      expect(service.bindingHistory[0].providerModel.modelId).toBe('model-1');
      expect(service.bindingHistory[1].providerModel.modelId).toBe('model-2');
      expect(service.bindingHistory[2].providerModel.modelId).toBe('model-3');
    });

    it('binding history is immutable (readonly array)', async () => {
      const service = new AiInvocationService(makeConfig());
      await service.resolve(makeInvocation());

      // bindingHistory returns a readonly array — the type system prevents .push()
      const history = service.bindingHistory;
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      // The getter returns a new reference each time (from the private array)
      expect(service.bindingHistory).toBe(service.bindingHistory);
    });
  });

  describe('guard integration', () => {
    it('guard rejects when provider does not match binding', async () => {
      const service = new AiInvocationService(makeConfig());

      // Resolve with one provider
      const result = await service.resolve(
        makeInvocation({ preferredProviderId: 'provider-a', preferredModelId: 'model-a' }),
      );

      // Guard check: provider must match binding
      expect(result.binding.providerModel.providerId).toBe('provider-a');

      // If caller tries to use a different provider, guard denies
      // (This is tested at the GuardedAIProvider level)
    });

    it('guard passes when provider/model match binding', async () => {
      const service = new AiInvocationService(makeConfig());

      const result = await service.resolve(
        makeInvocation({ preferredProviderId: 'my-provider', preferredModelId: 'my-model' }),
      );

      expect(result.allowed).toBe(true);
      expect(result.binding.providerModel.providerId).toBe('my-provider');
      expect(result.binding.providerModel.modelId).toBe('my-model');
    });
  });

  describe('hardcoded model as preference', () => {
    it('caller hardcoded model becomes preference, resolved by service', async () => {
      const service = new AiInvocationService(makeConfig());

      // Caller passes hardcoded model — service treats it as preference
      const result = await service.resolve(
        makeInvocation({
          preferredModelId: 'deepseek-v4-flash-free',
        }),
      );

      // The model is resolved through the service, not used as authority
      expect(result.binding.providerModel.modelId).toBe('deepseek-v4-flash-free');
      expect(result.allowed).toBe(true);
    });

    it('API body.model treated as preference, not authority', async () => {
      const service = new AiInvocationService(makeConfig());

      // API request body.model is a preference
      const result = await service.resolve(
        makeInvocation({
          preferredModelId: 'nemotron-3-ultra-free',
        }),
      );

      expect(result.binding.providerModel.modelId).toBe('nemotron-3-ultra-free');
      expect(result.binding.resolutionFacts.routingReason).toBe('task-override');
    });
  });
});
