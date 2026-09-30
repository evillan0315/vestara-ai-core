import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AssistantExecutionRecord,
  ExecutionId,
  ExecutionResult,
  RuntimeSessionId,
} from '@vestara/execution-types';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteConversationStore } from '../src';

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function record(executionId: string, conversationId = 'conversation-1'): AssistantExecutionRecord {
  return {
    executionId: executionId as ExecutionId,
    conversationId,
    assistantMessageId: `assistant-${executionId}`,
    status: 'requested',
    requestedAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
  };
}

describe('SqliteConversationStore assistant execution authority', () => {
  it('round-trips lifecycle, OpenCode correlation, and terminal result', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'vestara-assistant-execution-'));
    const store = new SqliteConversationStore({ dbPath: join(tempDir, 'conversations.db') });
    await store.initialize();

    const initial = record('exec-opencode');
    await store.createExecution(initial);
    await store.updateExecutionStatus(initial.executionId, 'binding', '2026-09-28T00:00:00.100Z');
    await store.updateExecutionStatus(initial.executionId, 'ready', '2026-09-28T00:00:00.200Z');
    await store.updateExecutionStatus(initial.executionId, 'running', '2026-09-28T00:00:00.300Z');
    await store.updateExecutionRuntime(
      initial.executionId,
      {
        runtimeId: 'opencode',
        sessionId: 'ses_1',
        runtimeSessionId: 'ses_1' as RuntimeSessionId,
      },
      '2026-09-28T00:00:00.400Z',
    );

    const result: ExecutionResult = {
      id: initial.executionId,
      status: 'completed',
      artifacts: [],
      evidence: [],
      timing: {
        requestedAt: initial.requestedAt,
        startedAt: '2026-09-28T00:00:00.300Z',
        completedAt: '2026-09-28T00:00:01.000Z',
      },
    };
    await store.attachExecutionResult(initial.executionId, result, '2026-09-28T00:00:01.000Z');
    await store.updateExecutionStatus(initial.executionId, 'completed', '2026-09-28T00:00:01.000Z');

    const reloaded = await store.getExecution(initial.executionId);
    expect(reloaded?.assistantMessageId).toBe(initial.assistantMessageId);
    expect(reloaded?.runtime).toMatchObject({ runtimeId: 'opencode', sessionId: 'ses_1' });
    expect(reloaded?.result?.id).toBe(initial.executionId);
    expect(reloaded?.status).toBe('completed');
  });

  it('preserves Codex thread correlation and excludes terminal executions from active lookup', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'vestara-assistant-execution-'));
    const store = new SqliteConversationStore({ dbPath: join(tempDir, 'conversations.db') });
    await store.initialize();

    const active = record('exec-codex-active');
    const terminal = record('exec-codex-terminal');
    await store.createExecution(active);
    await store.createExecution(terminal);
    await store.updateExecutionStatus(active.executionId, 'binding', '2026-09-28T00:00:00.100Z');
    await store.updateExecutionStatus(active.executionId, 'ready', '2026-09-28T00:00:00.200Z');
    await store.updateExecutionStatus(active.executionId, 'running', '2026-09-28T00:00:00.300Z');
    await store.updateExecutionRuntime(
      active.executionId,
      { runtimeId: 'codex', threadId: 'thread_1' },
      '2026-09-28T00:00:00.400Z',
    );
    await store.updateExecutionStatus(terminal.executionId, 'binding', '2026-09-28T00:00:00.100Z');
    await store.updateExecutionStatus(terminal.executionId, 'ready', '2026-09-28T00:00:00.200Z');
    await store.updateExecutionStatus(terminal.executionId, 'running', '2026-09-28T00:00:00.300Z');
    await store.updateExecutionStatus(terminal.executionId, 'cancelled', '2026-09-28T00:00:00.400Z');

    const activeRows = await store.listActiveExecutions('conversation-1');
    expect(activeRows.map((row) => row.executionId)).toEqual([active.executionId]);
    expect((await store.getExecution(active.executionId))?.runtime).toEqual({
      runtimeId: 'codex',
      threadId: 'thread_1',
    });
  });

  it('rejects invalid lifecycle transitions and mismatched terminal results', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'vestara-assistant-execution-'));
    const store = new SqliteConversationStore({ dbPath: join(tempDir, 'conversations.db') });
    await store.initialize();
    const initial = record('exec-invalid');
    await store.createExecution(initial);

    await expect(
      store.updateExecutionStatus(initial.executionId, 'completed', '2026-09-28T00:00:00.100Z'),
    ).rejects.toThrow('Invalid assistant execution transition');
    await expect(
      store.attachExecutionResult(
        initial.executionId,
        {
          id: 'other-execution' as ExecutionId,
          status: 'completed',
          artifacts: [],
          evidence: [],
          timing: { requestedAt: initial.requestedAt },
        },
        '2026-09-28T00:00:00.100Z',
      ),
    ).rejects.toThrow('Execution result identity mismatch');
  });
});
