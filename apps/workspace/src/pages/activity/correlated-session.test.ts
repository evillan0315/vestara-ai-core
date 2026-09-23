import { describe, expect, it } from 'vitest';
import { deriveCorrelatedSessions } from './correlated-session';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

function item(input: Partial<M11CStreamItem> & Pick<M11CStreamItem, 'id' | 'sequence' | 'kind'>): M11CStreamItem {
  const { id, sequence, kind, ...overrides } = input;
  return {
    id,
    sequence,
    timestamp: `2026-09-23T00:00:${String(sequence).padStart(2, '0')}Z`,
    kind,
    importance: kind === 'conversation' ? 'primary' : 'secondary',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    content: kind,
    fresh: false,
    ...overrides,
  };
}

const tool = (
  id: string,
  sequence: number,
  callID: string,
  status: 'started' | 'completed' | 'failed',
  executionId = 'exec-1',
) => item({
  id,
  sequence,
  kind: status === 'started' ? 'tool-call' : 'tool-result',
  executionId,
  tool: { toolName: 'bash', callID, status },
});

describe('AR-COORD-002 correlated activity presentation', () => {
  it('coalesces one operation lifecycle and hides it from the top-level stream', () => {
    const result = deriveCorrelatedSessions([
      item({ id: 'message-1', sequence: 1, kind: 'conversation', executionId: 'exec-1', content: 'Investigate' }),
      tool('tool-start', 2, 'call-1', 'started'),
      tool('tool-complete', 3, 'call-1', 'completed'),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.session).toMatchObject({
      status: 'completed',
      operations: [{ operationId: 'call-1', status: 'completed', activityIds: ['tool-start', 'tool-complete'] }],
    });
  });

  it('keeps failed and retried operations distinct', () => {
    const result = deriveCorrelatedSessions([
      item({ id: 'message-1', sequence: 1, kind: 'conversation', executionId: 'exec-1' }),
      tool('failed', 2, 'call-failed', 'failed'),
      tool('retry', 3, 'call-retry', 'completed'),
    ]);

    expect(result[0]?.session?.status).toBe('failed');
    expect(result[0]?.session?.operations.map((operation) => operation.operationId)).toEqual(['call-failed', 'call-retry']);
  });

  it('never merges different lineage keys or uncorrelated historical tools', () => {
    const result = deriveCorrelatedSessions([
      item({ id: 'message-1', sequence: 1, kind: 'conversation', executionId: 'exec-1' }),
      tool('tool-1', 2, 'same-looking-call', 'completed', 'exec-1'),
      tool('tool-2', 3, 'same-looking-call', 'completed', 'exec-2'),
      item({ id: 'historical-tool', sequence: 4, kind: 'tool-result', tool: { toolName: 'grep', callID: 'old-call', status: 'completed' } }),
    ]);

    expect(result.map((entry) => entry.id)).toEqual(['message-1', 'tool-2', 'historical-tool']);
    expect(result[0]?.session?.operations.map((operation) => operation.operationId)).toEqual(['same-looking-call']);
  });

  it('preserves important non-tool lifecycle events and interactions', () => {
    const interaction = item({ id: 'interaction', sequence: 3, kind: 'interaction', executionId: 'exec-1' });
    const result = deriveCorrelatedSessions([
      item({ id: 'message', sequence: 1, kind: 'conversation', executionId: 'exec-1' }),
      item({ id: 'conversation-complete', sequence: 2, kind: 'activity', executionId: 'exec-1' }),
      interaction,
      item({ id: 'agent-failed', sequence: 4, kind: 'diagnostic', executionId: 'exec-1' }),
      tool('tool', 5, 'call-1', 'completed'),
    ]);

    expect(result.map((entry) => entry.id)).toEqual(['message', 'conversation-complete', 'interaction', 'agent-failed']);
  });

  it('updates the same presentation session from running to completed without duplicating its parent', () => {
    const running = deriveCorrelatedSessions([
      item({ id: 'message', sequence: 1, kind: 'conversation', executionId: 'exec-1' }),
      tool('tool', 2, 'call-1', 'started'),
    ]);
    const completed = deriveCorrelatedSessions([
      item({ id: 'message', sequence: 1, kind: 'conversation', executionId: 'exec-1' }),
      tool('tool', 2, 'call-1', 'started'),
      tool('tool-result', 3, 'call-1', 'completed'),
    ]);

    expect(running).toHaveLength(1);
    expect(running[0]?.session?.status).toBe('working');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.session?.status).toBe('completed');
  });

  it('uses a shared conversation lineage when parent and tools expose different stronger fields', () => {
    const result = deriveCorrelatedSessions([
      item({ id: 'message', sequence: 1, kind: 'conversation', originConversationId: 'conv-1' }),
      item({
        id: 'tool-start',
        sequence: 2,
        kind: 'tool-call',
        originConversationId: 'conv-1',
        runtimeSessionBindingId: 'session-1',
        tool: { toolName: 'bash', callID: 'call-1', status: 'started', sessionId: 'session-1' },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.session?.operations[0]?.operationId).toBe('call-1');
  });
});
