/**
 * VES-REPO-005 — repository context propagation through the port boundary.
 *
 * A request carrying an explicit ExecutionRepositoryContext must arrive at
 * the runtime adapter intact and unmodified. Requests without the field
 * remain valid (backward compatible). The port performs no inference.
 */
import { describe, expect, it } from 'vitest';
import type {
  ExecutionId,
  ExecutionRequest,
  RuntimeBinding,
  RuntimeExecutionHandle,
  RuntimeExecutionPort,
} from '../../execution-types/src/index.js';

function context() {
  return {
    executionId: 'e1' as never,
    repositoryId: 'r1' as never,
    baselineSnapshotId: 's0' as never,
    accessMode: 'ANALYZE' as const,
    changeIntent: {
      executionId: 'e1' as never,
      repositoryId: 'r1' as never,
      purpose: 'persistence change',
      scopes: [{ level: 'package' as const, name: 'persistence' }],
      mutationKind: 'source' as const,
    },
    boundAt: '2026-09-14T00:01:00.000Z',
  };
}

function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    id: 'e1' as ExecutionId,
    actor: { kind: 'agent', id: 'developer' },
    objective: 'inspect persistence',
    context: {},
    ...overrides,
  };
}

class RecordingPort implements RuntimeExecutionPort {
  received: { request: ExecutionRequest; binding: RuntimeBinding } | undefined;

  async execute(request: ExecutionRequest, binding: RuntimeBinding): Promise<RuntimeExecutionHandle> {
    this.received = { request, binding };
    return {
      executionId: request.id,
      binding,
      observations: (async function* () {})(),
      cancel: async () => {},
    };
  }
}

const binding: RuntimeBinding = {
  executionId: 'e1' as ExecutionId,
  runtimeId: 'fake-runtime',
  boundAt: '2026-09-14T00:00:00.000Z',
};

describe('repository context propagation', () => {
  it('delivers the bound context to the runtime unmodified', async () => {
    const port = new RecordingPort();
    const repositoryContext = context();
    await port.execute(request({ context: { repositoryContext: repositoryContext as never } }), binding);
    expect(port.received?.request.context.repositoryContext).toEqual(repositoryContext);
    // The runtime session is assigned by the binding, never derived from context.
    expect(port.received?.request.context.repositoryContext).not.toHaveProperty('runtimeSessionId');
  });

  it('keeps requests without repository context valid', async () => {
    const port = new RecordingPort();
    await port.execute(request(), binding);
    expect(port.received?.request.context.repositoryContext).toBeUndefined();
    expect(port.received?.request.id).toBe('e1');
  });
});
