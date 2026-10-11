import { describe, expect, it } from 'vitest';
import type { WorkflowSummary } from '@vestara/activity-room';
import type { M11CStreamItem } from '../hooks/useM11CActivityRoom';
import { projectActivityStreamWorkflowGraph } from './activity-workflow-graph';

function item(
  sequence: number,
  overrides: Partial<M11CStreamItem> & { readonly workflowRunId?: string },
): M11CStreamItem {
  return {
    id: `si-${sequence}`,
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 5, 0, sequence)).toISOString(),
    kind: 'activity',
    importance: 'secondary',
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    content: 'working',
    fresh: false,
    ...overrides,
  };
}

function summary(workflowRunId: string, status: WorkflowSummary['status']): WorkflowSummary {
  return {
    workflowRunId: workflowRunId as WorkflowSummary['workflowRunId'],
    status,
    taskCount: 1,
    completedTasks: 0,
    failedTasks: 0,
    startedAt: new Date(Date.UTC(2026, 8, 24, 5, 0, 0)).toISOString(),
    lastActivityAt: new Date(Date.UTC(2026, 8, 24, 5, 0, 1)).toISOString(),
  };
}

describe('projectActivityStreamWorkflowGraph', () => {
  it('returns null when the run has no items', () => {
    const stream = [item(1, { workflowRunId: 'wf-other' })];
    expect(projectActivityStreamWorkflowGraph(stream, 'wf-missing')).toBeNull();
    expect(projectActivityStreamWorkflowGraph([], 'wf-missing')).toBeNull();
  });

  it('projects a plan-only graph when items carry no task ids', () => {
    const stream = [item(1, { workflowRunId: 'wf-1', kind: 'progress' })];
    const graph = projectActivityStreamWorkflowGraph(stream, 'wf-1');
    expect(graph?.nodes).toHaveLength(1);
    expect(graph?.nodes[0]).toMatchObject({ kind: 'plan', status: 'approved' });
    expect(graph?.edges).toHaveLength(0);
  });

  it('projects tasks with contains edges and derived statuses, never depends_on', () => {
    const stream = [
      item(1, { workflowRunId: 'wf-1', taskId: 'task-a', kind: 'progress', content: 'started' }),
      item(2, { workflowRunId: 'wf-1', taskId: 'task-b', kind: 'activity', content: 'task-b completed' }),
      item(3, { workflowRunId: 'wf-1', taskId: 'task-c', kind: 'diagnostic', content: 'boom' }),
      item(4, { workflowRunId: 'wf-2', taskId: 'task-other', kind: 'progress' }),
    ];
    const graph = projectActivityStreamWorkflowGraph(stream, 'wf-1');
    expect(graph?.nodes.map((node) => node.kind)).toEqual(['plan', 'task', 'task', 'task']);
    const byLabel = new Map((graph?.nodes ?? []).map((node) => [node.label, node.status]));
    expect(byLabel.get('task-a')).toBe('in-progress');
    expect(byLabel.get('task-b')).toBe('completed');
    expect(byLabel.get('task-c')).toBe('failed');
    expect(graph?.nodes[0]).toMatchObject({ kind: 'plan', status: 'needs-revision' });
    expect(graph?.edges.map((edge) => edge.kind)).toEqual(['contains', 'contains', 'contains']);
    expect(graph?.edges.every((edge) => edge.source === graph?.nodes[0].id)).toBe(true);
  });

  it('lets the authoritative summary override the derived plan status', () => {
    const stream = [item(1, { workflowRunId: 'wf-1', taskId: 'task-a', kind: 'progress' })];
    const graph = projectActivityStreamWorkflowGraph(stream, 'wf-1', summary('wf-1', 'completed'));
    expect(graph?.nodes[0]).toMatchObject({ status: 'completed' });
  });

  it('ignores summaries naming a different run', () => {
    const stream = [item(1, { workflowRunId: 'wf-1', taskId: 'task-a', kind: 'progress' })];
    const graph = projectActivityStreamWorkflowGraph(stream, 'wf-1', summary('wf-2', 'completed'));
    expect(graph?.nodes[0]).toMatchObject({ status: 'executing' });
  });
});
