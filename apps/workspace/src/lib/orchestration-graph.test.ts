import { describe, expect, it } from 'vitest';
import { projectOrchestrationGraph, type OrchestrationGraphSnapshot } from './orchestration-graph';

function snapshot(): OrchestrationGraphSnapshot {
  return {
    plan: { id: 'plan-1', title: 'Plan 1', status: 'approved' },
    tasks: [
      { id: 'task-a', planId: 'plan-1', summary: 'A', status: 'completed', dependencies: [] },
      { id: 'task-b', planId: 'plan-1', summary: 'B', status: 'awaiting-verification', dependencies: ['task-a'] },
      { id: 'task-c', planId: 'plan-1', summary: 'C', status: 'pending', dependencies: ['task-a', 'task-b'] },
    ],
  };
}

describe('WF-GRAPH-003 Workspace consumption boundary', () => {
  it('adapts an existing orchestration snapshot without changing graph semantics', () => {
    const graph = projectOrchestrationGraph(snapshot());

    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'workflow-plan:plan-1',
      'workflow-task:task-a',
      'workflow-task:task-b',
      'workflow-task:task-c',
    ]);
    expect(graph.edges.filter((edge) => edge.kind === 'contains')).toHaveLength(3);
    expect(graph.edges.filter((edge) => edge.kind === 'depends_on').map(({ source, target }) => [source, target])).toEqual([
      ['workflow-task:task-a', 'workflow-task:task-b'],
      ['workflow-task:task-a', 'workflow-task:task-c'],
      ['workflow-task:task-b', 'workflow-task:task-c'],
    ]);
  });

  it('preserves source identities and domain statuses', () => {
    const graph = projectOrchestrationGraph(snapshot());

    expect(graph.nodes[0]).toMatchObject({
      source: { kind: 'plan', id: 'plan-1' },
      status: 'approved',
    });
    expect(graph.nodes[2]).toMatchObject({
      source: { kind: 'task', id: 'task-b' },
      status: 'awaiting-verification',
    });
  });

  it('filters tasks to the selected plan and omits unresolved dependencies', () => {
    const graph = projectOrchestrationGraph({
      ...snapshot(),
      tasks: [
        ...snapshot().tasks,
        { id: 'other-task', planId: 'other-plan', summary: 'Other', status: 'ready', dependencies: [] },
        { id: 'task-d', planId: 'plan-1', summary: 'D', status: 'pending', dependencies: ['missing'] },
      ],
    });

    expect(graph.nodes.some((node) => node.id === 'workflow-task:other-task')).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'workflow-task:missing')).toBe(false);
    expect(
      graph.edges.some(
        (edge) => edge.kind === 'depends_on' && edge.target === 'workflow-task:task-d',
      ),
    ).toBe(false);
  });

  it('fails closed when the API snapshot has no selected plan', () => {
    expect(() => projectOrchestrationGraph({ plan: undefined, tasks: [] })).toThrow(
      'Cannot project workflow graph without a selected WorkflowPlan',
    );
  });
});
