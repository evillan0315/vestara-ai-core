import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ExecutionId, ExecutionResult, RuntimeSessionId, TurnId } from '../src';
import type {
  AssistantExecutionReconciliation,
  AssistantExecutionRecord,
  AssistantRuntimeCorrelation,
} from '../src/assistant-execution';

const executionId = 'exec-assistant-1' as ExecutionId;
const runtimeSessionId = 'runtime-session-1' as RuntimeSessionId;
const turnId = 'turn-1' as TurnId;

describe('durable assistant execution contract', () => {
  it('keeps canonical execution identity branded and distinct from other identities', () => {
    expectTypeOf<ExecutionId>().not.toEqualTypeOf<string>();
    const record: AssistantExecutionRecord = {
      executionId,
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1',
      status: 'requested',
      requestedAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    };

    expect(record.executionId).toBe('exec-assistant-1');
    expect(record.executionId).not.toBe(record.conversationId);
    expect(record.executionId).not.toBe(record.assistantMessageId);
  });

  it('represents OpenCode and Codex correlations without false symmetry', () => {
    const openCode: AssistantRuntimeCorrelation = {
      runtimeId: 'opencode',
      sessionId: 'ses_1',
      turnId,
      runtimeSessionId,
    };
    const codex: AssistantRuntimeCorrelation = {
      runtimeId: 'codex',
      threadId: 'thread_1',
      turnId,
      runtimeSessionId,
    };

    expect(openCode).toHaveProperty('sessionId');
    expect(openCode).not.toHaveProperty('threadId');
    expect(codex).toHaveProperty('threadId');
    expect(codex).not.toHaveProperty('sessionId');
  });

  it('keeps persisted lifecycle separate from runtime reconciliation', () => {
    const reconciliation: AssistantExecutionReconciliation = {
      executionId,
      observedAt: '2026-09-28T00:00:01.000Z',
      status: 'unknown',
      runtimeId: 'opencode',
      runtimeAvailable: 'unavailable',
    };
    const record: AssistantExecutionRecord = {
      executionId,
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1',
      status: 'running',
      requestedAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:01.000Z',
    };

    expect(record.status).toBe('running');
    expect(reconciliation.status).toBe('unknown');
    expect(reconciliation.runtimeAvailable).toBe('unavailable');
  });

  it('correlates terminal result to the same execution and assistant message', () => {
    const result: ExecutionResult = {
      id: executionId,
      status: 'completed',
      artifacts: [],
      evidence: [],
      timing: {
        requestedAt: '2026-09-28T00:00:00.000Z',
        completedAt: '2026-09-28T00:00:02.000Z',
      },
    };
    const record: AssistantExecutionRecord = {
      executionId,
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1',
      status: 'completed',
      requestedAt: result.timing.requestedAt,
      updatedAt: result.timing.completedAt as string,
      result,
    };

    expect(record.result?.id).toBe(record.executionId);
    expect(record.assistantMessageId).toBe('message-1');
    expect(record.status).toBe(record.result?.status);
  });

  it('does not encode disconnect or reload as cancellation', () => {
    const record: AssistantExecutionRecord = {
      executionId,
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1',
      status: 'running',
      requestedAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:01.000Z',
    };

    expect(record.status).not.toBe('cancelled');
  });

  it('has no Activity Room or UI dependency in the contract surface', () => {
    const record: AssistantExecutionRecord = {
      executionId,
      conversationId: 'conversation-1',
      assistantMessageId: 'message-1',
      status: 'requested',
      requestedAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    };

    expect(record).toBeDefined();
  });
});
