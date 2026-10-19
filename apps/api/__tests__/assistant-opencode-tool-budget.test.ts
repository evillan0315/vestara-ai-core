/**
 * GA-EXEC-003 — tool-call budget is a terminal turn failure.
 *
 * Observed 2026-10-19: a long turn that exceeded `maxToolCalls` yielded the
 * `Tool call limit reached` error but kept consuming the event stream. If the
 * runtime later settled idle, `executionResult.termination` was `completed`
 * while the persisted message/execution status said `failed`, and the
 * `finally` abort (which the source comment claimed tool-limit triggered) was
 * skipped because `requiresAbort('completed')` is false.
 *
 * Contract asserted here:
 *   1. Breach settles `termination: 'failed'` — never `completed`.
 *   2. The session is aborted (`requiresAbort('failed')`), so the runtime
 *      cannot keep executing tools after Vestara declares the turn failed.
 *   3. A turn within budget is unaffected (`completed`, no abort).
 */

import type { CompletionRequest } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { createAssistantOpenCodeExecutor } from '../src/assistant-opencode-adapter';

const SESSION_ID = 'oc-budget';

function budgetClient(toolCalls: number) {
  const aborts: string[] = [];
  const client = {
    createSession: async () => ({ id: SESSION_ID }),
    getSession: async (id: string) => ({ id }),
    sendMessageAsync: async () => undefined,
    openEventStream: async function* () {
      for (let index = 0; index < toolCalls; index++) {
        yield {
          type: 'session.next.tool.called',
          payload: { sessionID: SESSION_ID, callID: `call-${index}`, tool: 'read' },
        };
      }
      yield { type: 'session.status', payload: { sessionID: SESSION_ID, status: { type: 'idle' } } };
    },
    abortSession: async (id: string) => {
      aborts.push(id);
      return true;
    },
    getSessionDiff: async () => [],
    getSessionTodos: async () => [],
  };
  return { client, aborts };
}

function executorFor(client: unknown) {
  return createAssistantOpenCodeExecutor({
    client: client as never,
    workspaceId: 'workspace-1',
    directory: '/repo',
    agent: 'vestara-assistant',
    resolveProviderModel: async () => undefined,
  });
}

function request(executionConfig: CompletionRequest['executionConfig']): CompletionRequest {
  return {
    model: 'model-a',
    provider: 'provider-a',
    messages: [{ role: 'user' as const, content: 'keep reading until you find it' }],
    conversationId: 'conv-budget',
    executionConfig,
  } as CompletionRequest;
}

describe('GA-EXEC-003 tool-call budget termination', () => {
  it('settles failed and aborts the session when the budget is breached', async () => {
    const { client, aborts } = budgetClient(5);
    const response = await executorFor(client).complete(request({ maxToolCalls: 3 }));

    expect(response.content).toContain('Tool call limit reached: 3 tool calls');
    expect(response.executionResult?.termination).toBe('failed');
    expect(response.executionResult?.toolCallCount).toBe(3);
    expect(aborts).toEqual([SESSION_ID]);
  });

  it('keeps an in-budget turn completed with no abort', async () => {
    const { client, aborts } = budgetClient(2);
    const response = await executorFor(client).complete(request({ maxToolCalls: 5 }));

    expect(response.content).not.toContain('Tool call limit reached');
    expect(response.executionResult?.termination).toBe('completed');
    expect(response.executionResult?.toolCallCount).toBe(2);
    expect(aborts).toEqual([]);
  });

  it('treats maxToolCalls 0 as explicitly unlimited', async () => {
    const { client, aborts } = budgetClient(4);
    const response = await executorFor(client).complete(request({ maxToolCalls: 0 }));

    expect(response.content).not.toContain('Tool call limit reached');
    expect(response.executionResult?.termination).toBe('completed');
    expect(response.executionResult?.toolCallCount).toBe(4);
    expect(aborts).toEqual([]);
  });
});
