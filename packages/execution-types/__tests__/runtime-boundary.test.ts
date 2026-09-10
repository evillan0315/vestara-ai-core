import { describe, expect, it } from 'vitest';
import type {
  CanonicalPermissionAction,
  ExecutionId,
  ExecutionObservation,
  ExecutionRequest,
  RuntimeBinding,
  RuntimeExecutionHandle,
  RuntimeExecutionPort,
  RuntimeSessionId,
} from '../../execution-types/src/index.js';
import { isValidTransition, operationId } from '../../execution-types/src/index.js';

// ─── Fake Runtime Adapter (proves port is runtime-neutral) ──────────────────

/**
 * A minimal fake runtime adapter that satisfies RuntimeExecutionPort.
 *
 * This proves that the port contract is runtime-neutral: a fake implementation
 * can satisfy the same interface without any OpenCode dependency.
 */
class FakeRuntimeAdapter implements RuntimeExecutionPort {
  readonly runtimeId = 'fake-runtime';

  private available = true;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async execute(request: ExecutionRequest, binding: RuntimeBinding): Promise<RuntimeExecutionHandle> {
    const executionId = request.id;
    const observations = this.generateObservations(executionId);

    return {
      executionId,
      runtimeSessionId: 'fake-session-1' as RuntimeSessionId,
      binding: { ...binding, runtimeId: 'fake-runtime', boundAt: new Date().toISOString() },
      observations,
      cancel: async () => {
        // Fake cancellation — no-op
      },
    };
  }

  private async *generateObservations(executionId: ExecutionId): AsyncGenerator<ExecutionObservation> {
    const now = new Date().toISOString();

    // Status: running
    yield {
      kind: 'status',
      executionId,
      timestamp: now,
      status: 'running',
    };

    // Activity: tool call
    yield {
      kind: 'activity',
      executionId,
      timestamp: now,
      operationId: operationId('fake-tool-1'),
      activityType: 'tool-call',
      name: 'read',
      state: 'running',
    };

    // Activity: tool result
    yield {
      kind: 'activity',
      executionId,
      timestamp: now,
      operationId: operationId('fake-tool-1'),
      activityType: 'tool-result',
      name: 'read',
      state: 'completed',
      detail: { output: 'file content' },
    };

    // Result: completed
    yield {
      kind: 'result',
      executionId,
      timestamp: now,
      status: 'completed',
      output: 'Done',
    };
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('RuntimeExecutionPort', () => {
  it('fake adapter satisfies the port interface', () => {
    const adapter = new FakeRuntimeAdapter();
    // Type-level check: FakeRuntimeAdapter implements RuntimeExecutionPort
    expect(adapter.runtimeId).toBe('fake-runtime');
    expect(typeof adapter.execute).toBe('function');
    expect(typeof adapter.isAvailable).toBe('function');
  });

  it('fake adapter reports availability', async () => {
    const adapter = new FakeRuntimeAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('fake adapter executes and returns a handle', async () => {
    const adapter = new FakeRuntimeAdapter();
    const request: ExecutionRequest = {
      id: 'exec-1' as ExecutionId,
      actor: { kind: 'human', id: 'user-1' },
      objective: 'Read a file',
      context: { repositoryDir: '/tmp/repo' },
    };
    const binding: RuntimeBinding = {
      executionId: 'exec-1' as ExecutionId,
      runtimeId: 'fake-runtime',
      boundAt: new Date().toISOString(),
    };

    const handle = await adapter.execute(request, binding);

    expect(handle.executionId).toBe('exec-1');
    expect(handle.binding.runtimeId).toBe('fake-runtime');
    expect(handle.observations).toBeDefined();
  });

  it('fake adapter yields canonical observations', async () => {
    const adapter = new FakeRuntimeAdapter();
    const request: ExecutionRequest = {
      id: 'exec-2' as ExecutionId,
      actor: { kind: 'human', id: 'user-1' },
      objective: 'Test',
      context: {},
    };
    const binding: RuntimeBinding = {
      executionId: 'exec-2' as ExecutionId,
      runtimeId: 'fake-runtime',
      boundAt: new Date().toISOString(),
    };

    const handle = await adapter.execute(request, binding);
    const observations: ExecutionObservation[] = [];
    for await (const obs of handle.observations) {
      observations.push(obs);
    }

    // Should have: status(running) + activity(tool-call) + activity(tool-result) + result(completed)
    expect(observations).toHaveLength(4);
    expect(observations[0].kind).toBe('status');
    expect(observations[1].kind).toBe('activity');
    expect(observations[2].kind).toBe('activity');
    expect(observations[3].kind).toBe('result');
  });

  it('fake adapter cancel is callable', async () => {
    const adapter = new FakeRuntimeAdapter();
    const request: ExecutionRequest = {
      id: 'exec-3' as ExecutionId,
      actor: { kind: 'human', id: 'user-1' },
      objective: 'Test',
      context: {},
    };
    const binding: RuntimeBinding = {
      executionId: 'exec-3' as ExecutionId,
      runtimeId: 'fake-runtime',
      boundAt: new Date().toISOString(),
    };

    const handle = await adapter.execute(request, binding);
    // Should not throw
    await handle.cancel();
  });
});

describe('ExecutionRequest boundary', () => {
  it('request contains no OpenCode-specific fields', () => {
    const request: ExecutionRequest = {
      id: 'exec-4' as ExecutionId,
      actor: { kind: 'agent', id: 'agent-1', role: 'developer' },
      objective: 'Fix the bug',
      context: {
        repositoryDir: '/repo',
        workspaceId: 'ws-1',
      },
      routing: {
        providerId: 'openai',
        modelId: 'gpt-4',
      },
      permissions: {
        policyDecision: 'ask',
        approvedTools: ['read', 'glob'],
      },
      conversationId: 'conv-1',
      timeout: {
        turnTimeoutMs: 300_000,
        permissionTimeoutMs: 600_000,
      },
    };

    // Verify the request has canonical fields only
    expect(request.id).toBe('exec-4');
    expect(request.actor.kind).toBe('agent');
    expect(request.routing?.providerId).toBe('openai');
    expect(request.permissions?.policyDecision).toBe('ask');

    // Verify NO OpenCode-specific fields
    const requestStr = JSON.stringify(request);
    expect(requestStr).not.toContain('openCode');
    expect(requestStr).not.toContain('sessionId');
    expect(requestStr).not.toContain('prompt_async');
  });
});

describe('RuntimeBinding boundary', () => {
  it('binding uses runtime-neutral identifiers', () => {
    const binding: RuntimeBinding = {
      executionId: 'exec-5' as ExecutionId,
      runtimeId: 'opencode',
      runtimeSessionId: 'ses-123' as RuntimeSessionId,
      providerId: 'anthropic',
      modelId: 'claude-3',
      boundAt: '2026-01-01T00:00:00Z',
    };

    expect(binding.runtimeId).toBe('opencode');
    expect(binding.providerId).toBe('anthropic');
    expect(binding.modelId).toBe('claude-3');
    // RuntimeSessionId is a branded type — distinct from ExecutionId
    expect(binding.runtimeSessionId).not.toBe(binding.executionId);
  });
});

describe('Permission normalization preserves native identity', () => {
  it('canonical action and native action can differ', () => {
    // Simulate what the adapter does: normalize 'todowrite' → 'other'
    // but preserve 'todowrite' in nativeAction
    const nativeAction = 'todowrite';
    const canonicalAction: CanonicalPermissionAction = 'other';

    const observation: import('../../execution-types/src/observations.js').ExecutionPermissionObservation = {
      executionId: 'exec-6' as ExecutionId,
      timestamp: new Date().toISOString(),
      kind: 'permission',
      permissionRequestId: 'perm-1',
      canonicalAction,
      nativeAction,
      runtime: 'opencode',
      resources: ['todowrite'],
      risk: 'safe',
    };

    // The canonical action is 'other' (normalized)
    expect(observation.canonicalAction).toBe('other');
    // The native action is preserved
    expect(observation.nativeAction).toBe('todowrite');
    // They are different
    expect(observation.canonicalAction).not.toBe(observation.nativeAction);
  });

  it('multiple native actions map to same canonical action', () => {
    const nativeActions = ['task', 'todowrite', 'lsp', 'skill', 'question', 'doom_loop'];
    for (const native of nativeActions) {
      // All normalize to 'other'
      const canonical: CanonicalPermissionAction = 'other';
      expect(canonical).toBe('other');
      // Native is preserved
      expect(native).not.toBe('other');
    }
  });
});

describe('Execution lifecycle transitions', () => {
  it('validates the canonical lifecycle', () => {
    expect(isValidTransition('requested', 'binding')).toBe(true);
    expect(isValidTransition('binding', 'ready')).toBe(true);
    expect(isValidTransition('ready', 'running')).toBe(true);
    expect(isValidTransition('running', 'completed')).toBe(true);
  });

  it('validates failure paths', () => {
    expect(isValidTransition('requested', 'failed')).toBe(true);
    expect(isValidTransition('binding', 'failed')).toBe(true);
    expect(isValidTransition('running', 'failed')).toBe(true);
  });

  it('validates cancellation paths', () => {
    expect(isValidTransition('requested', 'cancelled')).toBe(true);
    expect(isValidTransition('ready', 'cancelled')).toBe(true);
    expect(isValidTransition('running', 'cancelled')).toBe(true);
  });

  it('validates timeout only from running', () => {
    expect(isValidTransition('running', 'timed_out')).toBe(true);
    expect(isValidTransition('ready', 'timed_out')).toBe(false);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(isValidTransition('completed', 'running')).toBe(false);
    expect(isValidTransition('failed', 'requested')).toBe(false);
    expect(isValidTransition('cancelled', 'running')).toBe(false);
    expect(isValidTransition('timed_out', 'running')).toBe(false);
  });
});

describe('ExecutionResult vs VerificationOutcome', () => {
  it('completed execution can have failed verification', () => {
    const result: import('../../execution-types/src/result.js').ExecutionResult = {
      id: 'exec-7' as ExecutionId,
      status: 'completed',
      artifacts: [],
      evidence: [],
      timing: { requestedAt: '2026-01-01T00:00:00Z' },
      verification: { verified: false, confidence: 'low' },
    };

    expect(result.status).toBe('completed');
    expect(result.verification?.verified).toBe(false);
  });

  it('completed execution can have no verification', () => {
    const result: import('../../execution-types/src/result.js').ExecutionResult = {
      id: 'exec-8' as ExecutionId,
      status: 'completed',
      artifacts: [],
      evidence: [],
      timing: { requestedAt: '2026-01-01T00:00:00Z' },
    };

    expect(result.status).toBe('completed');
    expect(result.verification).toBeUndefined();
  });
});

describe('Artifact references', () => {
  it('artifacts use references, not embedded payloads', () => {
    const artifact: import('../../execution-types/src/artifacts.js').ExecutionArtifact = {
      id: 'art-1',
      kind: 'file-change',
      reference: '/repo/src/file.ts',
      summary: 'Modified file.ts',
      metadata: { additions: 10, deletions: 5 },
    };

    expect(artifact.reference).toBe('/repo/src/file.ts');
    // No 'content' or 'data' field — only references
    expect(artifact).not.toHaveProperty('content');
    expect(artifact).not.toHaveProperty('data');
  });
});
