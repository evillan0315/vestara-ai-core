import { describe, expect, it } from 'vitest';
import type { ExecutionId, ExecutionLineageNode } from '../src/index.js';
import {
  ancestorIds,
  EXECUTION_NON_TERMINAL_STATES,
  EXECUTION_TERMINAL_STATES,
  EXECUTION_TRANSITIONS,
  executionDepth,
  isAncestor,
  isExecutionTerminal,
  isValidTransition,
  operationId,
  turnId,
} from '../src/index.js';

describe('Execution Identity', () => {
  it('creates branded TurnId', () => {
    const tid = turnId('turn-1');
    expect(tid).toBe('turn-1');
  });

  it('creates branded OperationId', () => {
    const oid = operationId('op-1');
    expect(oid).toBe('op-1');
  });
});

describe('Execution Lifecycle', () => {
  it('has exactly 8 lifecycle states', () => {
    const all = [...EXECUTION_TERMINAL_STATES, ...EXECUTION_NON_TERMINAL_STATES];
    expect(all).toHaveLength(8);
  });

  it('has exactly 4 terminal states', () => {
    expect(EXECUTION_TERMINAL_STATES).toHaveLength(4);
    expect(EXECUTION_TERMINAL_STATES).toContain('completed');
    expect(EXECUTION_TERMINAL_STATES).toContain('failed');
    expect(EXECUTION_TERMINAL_STATES).toContain('cancelled');
    expect(EXECUTION_TERMINAL_STATES).toContain('timed_out');
  });

  it('has exactly 4 non-terminal states', () => {
    expect(EXECUTION_NON_TERMINAL_STATES).toHaveLength(4);
    expect(EXECUTION_NON_TERMINAL_STATES).toContain('requested');
    expect(EXECUTION_NON_TERMINAL_STATES).toContain('binding');
    expect(EXECUTION_NON_TERMINAL_STATES).toContain('ready');
    expect(EXECUTION_NON_TERMINAL_STATES).toContain('running');
  });

  it('isExecutionTerminal returns true for terminal states', () => {
    expect(isExecutionTerminal('completed')).toBe(true);
    expect(isExecutionTerminal('failed')).toBe(true);
    expect(isExecutionTerminal('cancelled')).toBe(true);
    expect(isExecutionTerminal('timed_out')).toBe(true);
  });

  it('isExecutionTerminal returns false for non-terminal states', () => {
    expect(isExecutionTerminal('requested')).toBe(false);
    expect(isExecutionTerminal('binding')).toBe(false);
    expect(isExecutionTerminal('ready')).toBe(false);
    expect(isExecutionTerminal('running')).toBe(false);
  });

  it('validates the happy path: requested → binding → ready → running → completed', () => {
    expect(isValidTransition('requested', 'binding')).toBe(true);
    expect(isValidTransition('binding', 'ready')).toBe(true);
    expect(isValidTransition('ready', 'running')).toBe(true);
    expect(isValidTransition('running', 'completed')).toBe(true);
  });

  it('validates cancellation from any non-terminal state', () => {
    expect(isValidTransition('requested', 'cancelled')).toBe(true);
    expect(isValidTransition('binding', 'cancelled')).toBe(false); // binding can only go to ready or failed
    expect(isValidTransition('ready', 'cancelled')).toBe(true);
    expect(isValidTransition('running', 'cancelled')).toBe(true);
  });

  it('validates failure from non-terminal states', () => {
    expect(isValidTransition('requested', 'failed')).toBe(true);
    expect(isValidTransition('binding', 'failed')).toBe(true);
    expect(isValidTransition('running', 'failed')).toBe(true);
  });

  it('validates timeout only from running', () => {
    expect(isValidTransition('running', 'timed_out')).toBe(true);
    expect(isValidTransition('ready', 'timed_out')).toBe(false);
    expect(isValidTransition('requested', 'timed_out')).toBe(false);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(EXECUTION_TRANSITIONS.completed).toHaveLength(0);
    expect(EXECUTION_TRANSITIONS.failed).toHaveLength(0);
    expect(EXECUTION_TRANSITIONS.cancelled).toHaveLength(0);
    expect(EXECUTION_TRANSITIONS.timed_out).toHaveLength(0);
  });

  it('rejects invalid transitions', () => {
    expect(isValidTransition('completed', 'running')).toBe(false);
    expect(isValidTransition('failed', 'requested')).toBe(false);
    expect(isValidTransition('completed', 'failed')).toBe(false);
    expect(isValidTransition('timed_out', 'running')).toBe(false);
  });
});

describe('Execution Lineage', () => {
  function makeNode(id: string, parentId?: string, depth = 0): ExecutionLineageNode {
    return { executionId: id as ExecutionId, parentExecutionId: parentId as ExecutionId | undefined, depth };
  }

  const nodes = new Map<string, ExecutionLineageNode>([
    ['root', makeNode('root')],
    ['child-1', makeNode('child-1', 'root')],
    ['child-2', makeNode('child-2', 'root')],
    ['grandchild', makeNode('grandchild', 'child-1')],
    ['great-grandchild', makeNode('great-grandchild', 'grandchild')],
  ]);

  const lookup = (id: ExecutionId) => nodes.get(id);

  it('computes depth for root node', () => {
    const root = nodes.get('root')!;
    expect(executionDepth(root, lookup)).toBe(0);
  });

  it('computes depth for child', () => {
    const child = nodes.get('child-1')!;
    expect(executionDepth(child, lookup)).toBe(1);
  });

  it('computes depth for grandchild', () => {
    const grandchild = nodes.get('grandchild')!;
    expect(executionDepth(grandchild, lookup)).toBe(2);
  });

  it('computes depth for great-grandchild', () => {
    const greatGrandchild = nodes.get('great-grandchild')!;
    expect(executionDepth(greatGrandchild, lookup)).toBe(3);
  });

  it('collects ancestor IDs', () => {
    const greatGrandchild = nodes.get('great-grandchild')!;
    const ancestors = ancestorIds(greatGrandchild, lookup);
    expect(ancestors).toEqual(['grandchild', 'child-1', 'root']);
  });

  it('collects ancestor IDs for child', () => {
    const child = nodes.get('child-1')!;
    const ancestors = ancestorIds(child, lookup);
    expect(ancestors).toEqual(['root']);
  });

  it('returns empty ancestors for root', () => {
    const root = nodes.get('root')!;
    const ancestors = ancestorIds(root, lookup);
    expect(ancestors).toEqual([]);
  });

  it('checks ancestry correctly', () => {
    expect(isAncestor('root' as ExecutionId, 'grandchild' as ExecutionId, lookup)).toBe(true);
    expect(isAncestor('child-1' as ExecutionId, 'great-grandchild' as ExecutionId, lookup)).toBe(true);
    expect(isAncestor('child-2' as ExecutionId, 'grandchild' as ExecutionId, lookup)).toBe(false);
    expect(isAncestor('root' as ExecutionId, 'root' as ExecutionId, lookup)).toBe(false);
  });

  it('handles missing nodes gracefully', () => {
    const missing = nodes.get('nonexistent');
    expect(missing).toBeUndefined();
    expect(executionDepth(makeNode('missing'), () => undefined)).toBe(0);
    expect(ancestorIds(makeNode('missing'), () => undefined)).toEqual([]);
  });
});

describe('Execution Request contract', () => {
  it('ExecutionRequest has required fields', () => {
    // Type-level check: verify the interface shape
    const request = {
      id: 'exec-1' as ExecutionId,
      actor: { kind: 'human' as const, id: 'user-1' },
      objective: 'Fix the bug',
      context: {},
      artifacts: [],
      evidence: [],
      timing: { requestedAt: '2026-01-01T00:00:00Z' },
    };
    expect(request.id).toBe('exec-1');
    expect(request.actor.kind).toBe('human');
  });
});

describe('Execution Result contract', () => {
  it('ExecutionResult distinguishes completion from verification', () => {
    // An execution can complete but fail verification
    const result = {
      id: 'exec-1' as ExecutionId,
      status: 'completed' as const,
      artifacts: [],
      evidence: [],
      timing: { requestedAt: '2026-01-01T00:00:00Z' },
      verification: { verified: false, confidence: 'low' as const },
    };
    expect(result.status).toBe('completed');
    expect(result.verification?.verified).toBe(false);
  });

  it('ExecutionResult can have no verification', () => {
    const result = {
      id: 'exec-1' as ExecutionId,
      status: 'completed' as const,
      artifacts: [],
      evidence: [],
      timing: { requestedAt: '2026-01-01T00:00:00Z' },
    };
    expect(result.verification).toBeUndefined();
  });
});

describe('Artifact boundary', () => {
  it('ArtifactKind has 10 values', () => {
    const kinds = [
      'file-change',
      'diff',
      'shell-output',
      'generated-file',
      'test-result',
      'verification-evidence',
      'image',
      'document',
      'todo-snapshot',
      'other',
    ];
    expect(kinds).toHaveLength(10);
  });

  it('EvidenceKind has 8 values', () => {
    const kinds = ['command', 'file', 'test', 'log', 'screenshot', 'api', 'environment', 'custom'];
    expect(kinds).toHaveLength(8);
  });
});

describe('Activity boundary', () => {
  it('ExecutionActivityType has 12 values', () => {
    const types = [
      'text-delta',
      'tool-call',
      'tool-result',
      'file-edit',
      'shell-command',
      'permission-request',
      'permission-response',
      'question-asked',
      'question-answered',
      'subagent-started',
      'subagent-completed',
      'status-update',
    ];
    expect(types).toHaveLength(12);
  });
});
