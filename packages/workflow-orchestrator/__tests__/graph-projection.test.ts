import { describe, expect, it } from 'vitest';
import { projectWorkflowGraph, type WorkflowGraphSnapshot } from '../src/graph-projection';

function snapshot(
  dependencies: Record<string, string[]> = {},
  statuses: Record<string, string> = {},
): WorkflowGraphSnapshot {
  const taskIds = Object.keys(dependencies);
  const tasks = taskIds.map((id) => ({
    id,
    planId: 'plan-1',
    summary: `Summary ${id}`,
    description: '',
    files: [],
    dependencies: dependencies[id],
    status: (statuses[id] ?? 'pending') as 'pending',
    effort: 'medium' as const,
    requiredCapabilities: [],
    revisionCount: 0,
    attemptCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  return {
    plan: {
      id: 'plan-1',
      projectId: 'project-1',
      title: 'Plan 1',
      goal: 'Goal',
      revision: 1,
      status: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    tasks,
  };
}

describe('WF-GRAPH-002 workflow snapshot projection', () => {
  it('projects one plan, three tasks, and three containment edges', () => {
    const result = projectWorkflowGraph(snapshot({ a: [], b: [], c: [] }));

    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.filter((node) => node.kind === 'plan')).toHaveLength(1);
    expect(result.nodes.filter((node) => node.kind === 'task')).toHaveLength(3);
    expect(result.edges.filter((edge) => edge.kind === 'contains')).toHaveLength(3);
  });

  it('projects B depending on A as A to B', () => {
    const result = projectWorkflowGraph(snapshot({ a: [], b: ['a'] }));

    expect(result.edges.filter((edge) => edge.kind === 'depends_on')).toEqual([
      {
        id: 'depends_on:workflow-task:a->workflow-task:b',
        source: 'workflow-task:a',
        target: 'workflow-task:b',
        kind: 'depends_on',
      },
    ]);
  });

  it('projects multiple prerequisites independently', () => {
    const result = projectWorkflowGraph(snapshot({ a: [], b: [], c: ['a', 'b'] }));

    expect(result.edges.filter((edge) => edge.kind === 'depends_on').map(({ source, target }) => [source, target])).toEqual([
      ['workflow-task:a', 'workflow-task:c'],
      ['workflow-task:b', 'workflow-task:c'],
    ]);
  });

  it('is deterministic for identical authoritative input', () => {
    const first = projectWorkflowGraph(snapshot({ c: ['b', 'a'], a: [], b: [] }));
    const second = projectWorkflowGraph(snapshot({ b: [], a: [], c: ['b', 'a'] }));

    expect(second).toEqual(first);
  });

  it('preserves authoritative plan and task statuses', () => {
    const result = projectWorkflowGraph(snapshot({ a: [] }, { a: 'awaiting-verification' }));

    expect(result.nodes.find((node) => node.kind === 'plan')?.status).toBe('approved');
    expect(result.nodes.find((node) => node.kind === 'task')?.status).toBe('awaiting-verification');
  });

  it('does not infer relationships from matching labels or summaries', () => {
    const input = snapshot({ a: [], b: [] });
    input.tasks[1] = { ...input.tasks[1], summary: input.tasks[0].summary };

    const result = projectWorkflowGraph(input);

    expect(result.edges.filter((edge) => edge.kind === 'depends_on')).toHaveLength(0);
  });

  it('omits unresolved dependency edges without fabricating nodes', () => {
    const result = projectWorkflowGraph(snapshot({ a: ['missing'] }));

    expect(result.nodes.map((node) => node.id)).toEqual(['workflow-plan:plan-1', 'workflow-task:a']);
    expect(result.edges.filter((edge) => edge.kind === 'depends_on')).toHaveLength(0);
  });

  it('projects an empty selected plan as a valid plan-only graph', () => {
    const result = projectWorkflowGraph(snapshot());

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.kind).toBe('plan');
    expect(result.edges).toHaveLength(0);
  });

  it('fails closed when no selected plan is supplied', () => {
    expect(() => projectWorkflowGraph({ plan: undefined, tasks: [] })).toThrow(
      'Cannot project workflow graph without a selected WorkflowPlan',
    );
  });
});
