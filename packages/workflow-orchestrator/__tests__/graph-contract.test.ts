import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_GRAPH_DEPENDENCY_DIRECTION,
  workflowGraphEdgeId,
  workflowGraphNodeId,
  type WorkflowGraphProjection,
} from '../src/graph-contract';

describe('WF-GRAPH-001 contract', () => {
  it('represents a plan and task nodes with authoritative source references', () => {
    const planId = 'plan-1';
    const taskId = 'task-1';
    const projection: WorkflowGraphProjection = {
      nodes: [
        {
          id: workflowGraphNodeId('plan', planId),
          kind: 'plan',
          label: 'Plan',
          status: 'approved',
          source: { kind: 'plan', id: planId },
        },
        {
          id: workflowGraphNodeId('task', taskId),
          kind: 'task',
          label: 'Task',
          status: 'ready',
          source: { kind: 'task', id: taskId },
        },
      ],
      edges: [
        {
          id: workflowGraphEdgeId('contains', workflowGraphNodeId('plan', planId), workflowGraphNodeId('task', taskId)),
          source: workflowGraphNodeId('plan', planId),
          target: workflowGraphNodeId('task', taskId),
          kind: 'contains',
        },
      ],
    };

    expect(projection.nodes[0]?.source).toEqual({ kind: 'plan', id: planId });
    expect(projection.nodes[1]?.source).toEqual({ kind: 'task', id: taskId });
    expect(projection.edges[0]?.kind).toBe('contains');
  });

  it('represents B depending on A as a deterministic A-to-B edge', () => {
    const a = workflowGraphNodeId('task', 'task-a');
    const b = workflowGraphNodeId('task', 'task-b');
    const edge = {
      id: workflowGraphEdgeId('depends_on', a, b),
      source: a,
      target: b,
      kind: 'depends_on' as const,
    };

    expect(WORKFLOW_GRAPH_DEPENDENCY_DIRECTION).toBe('prerequisite_to_dependent');
    expect(edge).toEqual({
      id: 'depends_on:workflow-task:task-a->workflow-task:task-b',
      source: a,
      target: b,
      kind: 'depends_on',
    });
  });

  it('derives identity from source identity, not labels or position', () => {
    expect(workflowGraphNodeId('task', 'task-42')).toBe('workflow-task:task-42');
    expect(workflowGraphNodeId('task', 'task-42')).toBe(workflowGraphNodeId('task', 'task-42'));
    expect(workflowGraphNodeId('task', 'task-42')).not.toBe(workflowGraphNodeId('task', 'task-43'));
  });

  it('keeps domain status as an attribute and exposes no unsupported relationship kind', () => {
    const projection: WorkflowGraphProjection = {
      nodes: [
        {
          id: workflowGraphNodeId('task', 'task-1'),
          kind: 'task',
          label: 'Task',
          status: 'awaiting-verification',
          source: { kind: 'task', id: 'task-1' },
        },
      ],
      edges: [],
    };

    expect(projection.nodes[0]?.status).toBe('awaiting-verification');
    expect(projection.edges).toHaveLength(0);
  });
});
