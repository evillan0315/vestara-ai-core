import type { AssistantExecutionDetail } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { AssistantTurn } from '../src/store';

function toolDetail(
  overrides: Partial<Extract<AssistantExecutionDetail, { kind: 'tool' }>> & { operationId: string },
): AssistantExecutionDetail {
  return {
    contract: 'assistant.execution.v1',
    version: 1,
    kind: 'tool',
    tool: 'read',
    state: 'completed',
    source: 'opencode',
    timestamp: Date.now(),
    operationId: overrides.operationId,
    ...overrides,
  } as AssistantExecutionDetail;
}

function permissionDetail(operationId: string, state: 'requested' | 'resolved'): AssistantExecutionDetail {
  return {
    contract: 'assistant.execution.v1',
    version: 1,
    kind: 'permission',
    operationId,
    state: state === 'requested' ? 'running' : 'completed',
    permissionRequestId: 'per-1',
    action: 'webfetch',
    resources: ['https://example.com'],
    permissionState: state,
    source: 'opencode',
    timestamp: Date.now(),
  } as AssistantExecutionDetail;
}

describe('AssistantTurn', () => {
  it('creates one card per start — parallel same-name calls never merge', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('bash');
    turn.onToolStart('bash');
    expect(turn.operations).toHaveLength(2);
    expect(turn.operations.every((op) => op.state === 'running')).toBe(true);
    expect(turn.operations[0]?.id).not.toBe(turn.operations[1]?.id);
  });

  it('completes FIFO without identity', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('bash');
    turn.onToolStart('bash');
    turn.onToolResult('bash', 'first done');
    expect(turn.operations[0]).toMatchObject({ state: 'completed', preview: 'first done' });
    expect(turn.operations[1]?.state).toBe('running');
    turn.onToolResult('bash', 'second done');
    expect(turn.operations[1]).toMatchObject({ state: 'completed', preview: 'second done' });
  });

  it('correlates by operationId and never parses output prose', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('read', 'op-1');
    turn.onToolStart('read', 'op-2');
    // A successful tool whose output literally reads "failed" stays completed.
    turn.onToolResult('read', 'failed', toolDetail({ operationId: 'op-2' }));
    expect(turn.operations.find((op) => op.id.endsWith('-1') || op.name === 'read'));
    const completed = turn.operations.filter((op) => op.state === 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.preview).toBe('failed');
    // Explicit failed state wins over preview content.
    turn.onToolResult('read', 'some output', toolDetail({ operationId: 'op-1', state: 'failed' }));
    expect(turn.operations.filter((op) => op.state === 'failed')).toHaveLength(1);
  });

  it('tracks permission requested/resolved and never cards them', () => {
    const turn = new AssistantTurn();
    turn.onExecution(permissionDetail('op-p', 'requested'));
    expect(turn.pendingPermissions).toHaveLength(1);
    expect(turn.operations).toHaveLength(0);
    turn.onExecution(permissionDetail('op-p', 'requested'));
    expect(turn.pendingPermissions).toHaveLength(1);
    turn.onExecution(permissionDetail('op-p', 'resolved'));
    expect(turn.pendingPermissions).toHaveLength(0);
  });

  it('dismisses decided interactions from the pending queues', () => {
    const turn = new AssistantTurn();
    turn.onExecution(permissionDetail('op-p', 'requested'));
    turn.dismissPending('permission', 'op-p');
    expect(turn.pendingPermissions).toHaveLength(0);
    turn.dismissPending('permission', 'missing');
    turn.dismissPending('question', 'missing');
  });

  it('upserts structured projections and the task snapshot', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('edit', 'op-e');
    const edit = toolDetail({ operationId: 'op-e' });
    turn.onExecution({ ...edit, kind: 'terminal', outputPreview: 'ok' });
    expect(turn.structuredTerminals).toHaveLength(1);
    expect(turn.structuredTerminals[0]?.supersedesOpId).toBe(turn.operations[0]?.id);
    turn.onExecution({ ...edit, kind: 'task-snapshot', todos: [] });
    expect(turn.taskSnapshot?.kind).toBe('task-snapshot');
  });

  it('ignores unvalidated execution payloads', () => {
    const turn = new AssistantTurn();
    turn.onExecution({ kind: 'tool', operationId: 'x' });
    turn.onExecution(null);
    expect(turn.operations).toHaveLength(0);
    expect(turn.pendingPermissions).toHaveLength(0);
  });

  it('finalize resolves leftover running ops; reset clears everything', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('bash');
    turn.onDelta('hello ');
    turn.finalize('completed');
    expect(turn.operations[0]?.state).toBe('completed');
    turn.reset();
    expect(turn.operations).toHaveLength(0);
    expect(turn.streamingText).toBe('');
  });

  it('attaches bounded running previews without merging parallel starts', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('bash', 'op-1', 'partial output here');
    turn.onToolStart('bash', 'op-2');
    expect(turn.operations).toHaveLength(2);
    expect(turn.operations[0]).toMatchObject({ state: 'running', preview: 'partial output here' });
    expect(turn.operations[1]?.preview).toBeUndefined();
    // A later start for a known operation updates the preview in place.
    turn.onToolStart('bash', 'op-2', 'second partial');
    expect(turn.operations).toHaveLength(2);
    expect(turn.operations[1]).toMatchObject({ state: 'running', preview: 'second partial' });
  });

  it('never mints cards for question/task-snapshot results', () => {
    const turn = new AssistantTurn();
    const base = toolDetail({ operationId: 'op-q' });
    turn.onToolResult('tool', 'content', { ...base, kind: 'question' } as AssistantExecutionDetail);
    turn.onToolResult('tool', 'content', { ...base, operationId: 'op-s', kind: 'task-snapshot' } as AssistantExecutionDetail);
    expect(turn.operations).toHaveLength(0);
  });

  it('upserts structured reads with supersede correlation and clears them on reset', () => {
    const turn = new AssistantTurn();
    turn.onToolStart('read', 'op-r');
    const read = toolDetail({ operationId: 'op-r' });
    turn.onExecution({ ...read, kind: 'read' });
    expect(turn.structuredReads).toHaveLength(1);
    expect(turn.structuredReads[0]?.supersedesOpId).toBe(turn.operations[0]?.id);
    // Later evidence for the same operation replaces, never appends.
    turn.onExecution({ ...read, kind: 'read' });
    expect(turn.structuredReads).toHaveLength(1);
    turn.reset();
    expect(turn.structuredReads).toHaveLength(0);
    expect(turn.operations).toHaveLength(0);
  });

  it('rehydrates durable history with deterministic ids that correlate later', () => {
    const turn = new AssistantTurn();
    turn.rehydrateFromMessages([
      {
        id: 'm-1',
        conversationId: 'c-1',
        role: 'assistant',
        content: 'done',
        createdAt: '2026-10-26T00:00:00.000Z',
        toolObservations: [
          { toolCallId: 'c-1', operationId: 'op-1', toolName: 'read', status: 'completed', content: 'file body' },
          { toolCallId: 'c-2', toolName: 'bash', status: 'failed', content: '' },
        ],
      },
    ]);
    expect(turn.operations.map((op) => op.id)).toEqual(['hist-op-1', 'hist-c-2']);
    expect(turn.operations[0]).toMatchObject({ state: 'completed', preview: 'file body' });
    // A later live result for op-1 correlates instead of duplicating.
    turn.onToolResult('read', 'fresh', toolDetail({ operationId: 'op-1' }));
    expect(turn.operations).toHaveLength(2);
    expect(turn.operations[0]?.preview).toBe('fresh');
  });
});
