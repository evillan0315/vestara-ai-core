import { describe, expect, it } from 'vitest';
import { type CompactedContext, compactContext } from '../src/index.js';

type Item = Parameters<typeof compactContext>[0][number];

function item(kind: string, payload: Record<string, unknown>): Item {
  return {
    id: `i-${Math.random()}`,
    threadId: 'thread-1',
    turnId: 'turn-1',
    sequence: 0,
    kind: kind as never,
    actorId: 'agent',
    payload,
    createdAt: new Date().toISOString(),
    correlationId: 'corr',
  };
}

describe('compactContext', () => {
  it('keeps the full thread raw when under the window', () => {
    const items = [item('user-message', { content: 'hi' }), item('agent-message', { content: 'ok' })];
    const result = compactContext(items, 40);
    expect(result.summary).toBeUndefined();
    expect(result.recent).toHaveLength(2);
  });

  it('summarizes earlier turns while preserving non-negotiable execution facts', () => {
    const items: Item[] = [];
    // Earlier (compactable) turns.
    items.push(item('user-message', { content: 'Implement the feature' }));
    items.push(item('steering-message', { content: 'Focus on package boundaries' }));
    items.push(
      item('tool-call', { callId: 'call-1', toolName: 'filesystem.write', input: { path: 'a.ts', content: 'x' } }),
    );
    items.push(
      item('tool-result', { callId: 'call-1', toolName: 'filesystem.write', status: 'completed', evidence: [] }),
    );
    items.push(
      item('tool-result', { callId: 'call-2', toolName: 'filesystem.read', status: 'failed', error: 'EACCES' }),
    );
    items.push(item('approval-request', { approvalId: 'appr-1', toolName: 'filesystem.delete', decision: undefined }));
    items.push(
      item('approval-decision', { approvalId: 'appr-1', toolName: 'filesystem.delete', decision: 'approved' }),
    );
    items.push(item('verification-result', { status: 'passed', confidence: 0.95 }));
    // Recent (raw) turns.
    items.push(item('user-message', { content: 'keep this raw' }));
    items.push(item('agent-message', { content: 'recent reply' }));

    const result = compactContext(items, 2);
    expect(result.summary).toBeDefined();
    expect(result.recent).toHaveLength(2);
    expect(result.recent.map((entry) => entry.kind)).toEqual(['user-message', 'agent-message']);
    expect(result.summary).toContain('Instruction: Implement the feature');
    expect(result.summary).toContain('User steering: Focus on package boundaries');
    expect(result.summary).toContain('filesystem.write(call-1)');
    expect(result.summary).toContain('Changed files: a.ts');
    expect(result.summary).toContain('Failed attempts: filesystem.read: EACCES');
    expect(result.summary).toContain('Approvals: filesystem.delete: requested');
    expect(result.summary).toContain('filesystem.delete: approved');
    expect(result.summary).toContain('Verification: passed (95%)');
    expect(result.summary).toContain('do not redo completed work');
  });

  it('is deterministic for the same thread', () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      item(index % 2 === 0 ? 'user-message' : 'agent-message', { content: `m${index}` }),
    );
    const first = compactContext(items, 10);
    const second = compactContext(items, 10);
    expect(first.summary).toBe(second.summary);
    expect(first.recent).toHaveLength(10);
  });
});
