import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderHealthStatus,
  StreamChunk,
} from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import {
  DefaultProviderManager,
  EngineeringProviderCatalog,
  type EngineeringRoutingPolicy,
  EngineeringRoutingRuntime,
  FileRoutingAssignmentStore,
  FileRoutingStore,
  NoCompatibleRoutingCandidateError,
  ProviderHealthTracker,
  ROUTING_PROFILES,
  RoutingConflictError,
  VersionedRoutingStore,
} from '../src/index.js';

function model(id: string, price = 0): AIModel {
  return {
    id,
    provider: 'test',
    name: id,
    contextWindow: id === 'quality' ? 200_000 : 32_000,
    maxOutput: 8_000,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: price, outputPerMillionTokens: price },
    status: 'available',
  };
}

function provider(id: string, models: AIModel[]): AIProvider {
  return {
    id,
    name: id,
    version: '1.0.0',
    status: 'available',
    models: models.map((item) => ({ ...item, provider: id })),
    capabilities: { maxConcurrentRequests: 2, features: ['chat', 'streaming', 'function-calling'] },
    async initialize() {},
    async complete(_request: CompletionRequest): Promise<CompletionResponse> {
      throw new Error('not used');
    },
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {},
    async healthCheck(): Promise<ProviderHealthStatus> {
      return {
        status: 'healthy',
        providerId: id,
        modelCount: models.length,
        latency: 10,
        lastHeartbeat: new Date().toISOString(),
      };
    },
    async listModels() {
      return models;
    },
  };
}

function policy(overrides: Partial<EngineeringRoutingPolicy> = {}): EngineeringRoutingPolicy {
  return {
    id: 'balanced',
    mode: 'balanced',
    implementation: { requiredCapabilities: ['implementation', 'filesystem-write'] },
    verification: { requiredCapabilities: ['verification', 'code-review'] },
    fallback: {
      enabled: true,
      permittedStages: ['before-execution', 'before-first-output', 'mid-execution', 'verification'],
      requireApprovalAfterSideEffects: true,
      cooldownMs: 30_000,
    },
    constraints: {
      locality: 'allow-cloud',
      dataPolicy: 'source-allowed',
      costPolicy: 'unrestricted',
      requireIndependentVerifier: false,
    },
    ...overrides,
  };
}

describe('EngineeringRoutingRuntime', () => {
  it('can attach the kernel event bus after provider initialization', async () => {
    const emitted: string[] = [];
    const manager = new DefaultProviderManager();
    await manager.register(provider('managed', [model('coder')]));
    manager.registerEngineeringMetadata('managed', {
      capabilities: ['implementation', 'filesystem-write'],
      dataPolicies: ['source-allowed'],
    });
    manager.attachRuntimeServices({
      eventBus: {
        emit: async (event: { type: string }) => {
          emitted.push(event.type);
        },
      } as any,
    });

    await manager.routing.resolve({
      role: 'developer',
      agentId: 'developer-managed',
      policy: policy(),
      source: 'automatic',
    });

    expect(emitted).toEqual([
      'routing.selection-requested',
      'routing.candidates-evaluated',
      'routing.selection-resolved',
    ]);
  });

  it('automatically exposes manager registrations through the routing catalog', async () => {
    const manager = new DefaultProviderManager();
    await manager.register(provider('managed', [model('coder')]));
    manager.registerEngineeringMetadata('managed', {
      locality: 'local',
      capabilities: ['implementation', 'filesystem-write'],
      dataPolicies: ['source-allowed'],
    });

    const result = await manager.routing.resolve({
      role: 'developer',
      agentId: 'developer-managed',
      policy: policy(),
      source: 'automatic',
    });
    expect(result.selected.ref).toMatchObject({ providerId: 'managed', modelId: 'coder' });
  });

  it('resolves a role to a provider-scoped model and records rejected candidates', async () => {
    const catalog = new EngineeringProviderCatalog();
    catalog.register(provider('local', [model('coder')]), {
      locality: 'local',
      capabilities: ['implementation', 'filesystem-write'],
      dataPolicies: ['no-source-upload', 'metadata-only', 'source-allowed'],
      modelRevisions: { coder: '2026-08' },
    });
    catalog.register(provider('cloud', [model('chat')]), {
      locality: 'cloud',
      capabilities: ['conversation'],
      dataPolicies: ['source-allowed'],
    });

    const runtime = new EngineeringRoutingRuntime(catalog);
    const resolution = await runtime.resolve({
      role: 'developer',
      agentId: 'developer-07',
      policy: policy(),
      source: 'automatic',
    });

    expect(resolution.selected.ref).toEqual({ providerId: 'local', modelId: 'coder', modelRevision: '2026-08' });
    expect(resolution.evidence.selectedAgentId).toBe('developer-07');
    expect(resolution.evidence.rejectedCandidates[0]?.reasonCodes).toContain('missing-capability:implementation');
  });

  it('enforces local-only, free-only, and capability constraints', async () => {
    const catalog = new EngineeringProviderCatalog();
    catalog.register(provider('cloud', [model('quality', 10)]), {
      locality: 'cloud',
      capabilities: ['implementation', 'filesystem-write'],
      dataPolicies: ['source-allowed'],
    });
    const runtime = new EngineeringRoutingRuntime(catalog);

    const error = await runtime
      .resolve({
        role: 'developer',
        agentId: 'developer-01',
        source: 'console',
        policy: policy({
          constraints: {
            locality: 'local-only',
            dataPolicy: 'source-allowed',
            costPolicy: 'free-only',
            requireIndependentVerifier: false,
          },
        }),
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(NoCompatibleRoutingCandidateError);
    expect(error.rejectedCandidates[0].reasonCodes).toEqual(
      expect.arrayContaining(['cloud-provider-disallowed', 'paid-model']),
    );
  });

  it('blocks automatic fallback after side effects', () => {
    const runtime = new EngineeringRoutingRuntime(new EngineeringProviderCatalog());
    const request = {
      role: 'developer' as const,
      agentId: 'developer-01',
      source: 'automatic' as const,
      policy: policy(),
    };

    expect(runtime.canFallback('before-execution', false, request)).toBe(true);
    expect(runtime.canFallback('mid-execution', true, request)).toBe(false);
  });
});

describe('VersionedRoutingStore', () => {
  it('rejects stale concurrent updates and returns the current revision', () => {
    const store = new VersionedRoutingStore({ profileId: 'balanced', roles: {} }, 'workspace-ui');
    const updated = store.update({ profileId: 'local', roles: {} }, 0, 'console');
    expect(updated.revision).toBe(1);

    expect(() => store.update({ profileId: 'manual', roles: {} }, 0, 'workspace-ui')).toThrow(RoutingConflictError);
    try {
      store.update({ profileId: 'manual', roles: {} }, 0, 'workspace-ui');
    } catch (error) {
      expect((error as RoutingConflictError).current.selection.profileId).toBe('local');
    }
  });

  it('persists routing revisions for another client process', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-routing-'));
    const file = path.join(directory, 'routing.json');
    const store = new FileRoutingStore(file, { profileId: 'balanced', roles: {} });
    store.update({ profileId: 'local', roles: {} }, 0, 'console', new Date('2026-08-01T00:00:00Z'));

    const reopened = new FileRoutingStore(file, { profileId: 'balanced', roles: {} });
    expect(reopened.get()).toMatchObject({
      revision: 1,
      updatedByClientId: 'console',
      selection: { profileId: 'local' },
    });
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

describe('FileRoutingAssignmentStore', () => {
  it('pauses active work with side effects before allowing reassignment', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-assignments-'));
    const file = path.join(directory, 'assignments.json');
    const store = new FileRoutingAssignmentStore(file);
    let assignment = store.assign({
      taskId: 'TASK-1',
      role: 'developer',
      agentId: 'developer-01',
      route: { providerId: 'provider-a', modelId: 'model-a' },
      assignedByClientId: 'workspace-ui',
    });
    assignment = store.updateStatus('TASK-1', 'running', assignment.revision);
    assignment = store.recordSideEffect('TASK-1', assignment.revision);

    const pending = store.reassign({
      taskId: 'TASK-1',
      expectedRevision: assignment.revision,
      agentId: 'developer-02',
      route: { providerId: 'provider-b', modelId: 'model-b' },
      requestedByClientId: 'console',
      reason: 'provider unavailable',
      approved: false,
    });
    expect(pending.status).toBe('approval-required');
    expect(pending.assignment).toMatchObject({ status: 'paused', agentId: 'developer-01' });

    const approved = store.reassign({
      taskId: 'TASK-1',
      expectedRevision: pending.assignment.revision,
      agentId: 'developer-02',
      route: { providerId: 'provider-b', modelId: 'model-b' },
      requestedByClientId: 'console',
      reason: 'operator approved handoff',
      approved: true,
    });
    expect(approved.status).toBe('reassigned');
    expect(approved.assignment).toMatchObject({
      status: 'paused',
      agentId: 'developer-02',
      previousAssignment: { agentId: 'developer-01' },
    });
    expect(new FileRoutingAssignmentStore(file).get('TASK-1')).toEqual(approved.assignment);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('allows reassignment before side effects and rejects stale revisions', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-assignments-'));
    const store = new FileRoutingAssignmentStore(path.join(directory, 'assignments.json'));
    const assignment = store.assign({
      taskId: 'TASK-2',
      role: 'developer',
      agentId: 'developer-01',
      route: { providerId: 'provider-a', modelId: 'model-a' },
      assignedByClientId: 'automatic',
    });
    const result = store.reassign({
      taskId: 'TASK-2',
      expectedRevision: assignment.revision,
      agentId: 'developer-02',
      route: { providerId: 'provider-b', modelId: 'model-b' },
      requestedByClientId: 'console',
      reason: 'manual override',
      approved: false,
    });
    expect(result.status).toBe('reassigned');
    expect(() => store.updateStatus('TASK-2', 'running', assignment.revision)).toThrow(
      'Routing assignment revision conflict',
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

describe('ProviderHealthTracker', () => {
  it('uses failure and recovery thresholds to prevent routing churn', () => {
    const tracker = new ProviderHealthTracker({ failureThreshold: 3, recoveryThreshold: 2, cooldownMs: 1_000 });
    const start = new Date('2026-08-01T00:00:00.000Z');
    tracker.recordFailure('provider', start);
    tracker.recordFailure('provider', start);
    expect(tracker.availability('provider', start).state).toBe('degraded');
    tracker.recordFailure('provider', start);
    expect(tracker.availability('provider', start).state).toBe('cooling-down');
    expect(tracker.availability('provider', new Date(start.getTime() + 1_001)).state).toBe('degraded');
    tracker.recordSuccess('provider', 20, new Date(start.getTime() + 1_002));
    expect(tracker.availability('provider').state).toBe('degraded');
    tracker.recordSuccess('provider', 10, new Date(start.getTime() + 1_003));
    expect(tracker.availability('provider').state).toBe('healthy');
  });

  it('represents authentication, rate-limit, and disabled states independently', () => {
    const tracker = new ProviderHealthTracker();
    tracker.setAuthenticated('provider', false);
    expect(tracker.availability('provider').authenticated).toBe(false);
    tracker.setAuthenticated('provider', true);
    tracker.recordRateLimit('provider', new Date(Date.now() + 60_000));
    expect(tracker.availability('provider').state).toBe('rate-limited');
    tracker.setEnabled('provider', false);
    expect(tracker.availability('provider').state).toBe('disabled');
  });
});

describe('routing profiles', () => {
  it('provides accessible presets backed by explicit policies', () => {
    expect(ROUTING_PROFILES.map((profile) => profile.id)).toEqual([
      'local',
      'balanced',
      'best-quality',
      'fast',
      'strict-engineering',
      'manual',
    ]);
    expect(ROUTING_PROFILES.find((profile) => profile.id === 'local')?.policy.constraints.locality).toBe('local-only');
    expect(
      ROUTING_PROFILES.find((profile) => profile.id === 'strict-engineering')?.policy.constraints
        .requireIndependentVerifier,
    ).toBe(true);
    expect(ROUTING_PROFILES.find((profile) => profile.id === 'manual')?.policy.fallback.enabled).toBe(false);
  });
});
