import { describe, expect, it } from 'vitest';
import { workflowGraphNodeForSelection, workflowGraphToCytoscapeElements } from './workflow-graph-cytoscape';
import type { WorkflowGraphProjection } from '@vestara/workflow-orchestrator';

const graph: WorkflowGraphProjection = {
  nodes: [
    { id: 'workflow-plan:p1', kind: 'plan', label: 'Plan', status: 'approved', source: { kind: 'plan', id: 'p1' } },
    { id: 'workflow-task:a', kind: 'task', label: 'A', status: 'completed', source: { kind: 'task', id: 'a' } },
    { id: 'workflow-task:b', kind: 'task', label: 'B', status: 'pending', source: { kind: 'task', id: 'b' } },
  ],
  edges: [
    { id: 'contains:workflow-plan:p1->workflow-task:a', source: 'workflow-plan:p1', target: 'workflow-task:a', kind: 'contains' },
    { id: 'contains:workflow-plan:p1->workflow-task:b', source: 'workflow-plan:p1', target: 'workflow-task:b', kind: 'contains' },
    { id: 'depends_on:workflow-task:a->workflow-task:b', source: 'workflow-task:a', target: 'workflow-task:b', kind: 'depends_on' },
  ],
};

describe('workflowGraphToCytoscapeElements', () => {
  it('preserves canonical nodes, source identity, and edge direction', () => {
    const elements = workflowGraphToCytoscapeElements(graph);

    expect(elements).toHaveLength(6);
    expect(elements.slice(0, 3)).toEqual([
      expect.objectContaining({ group: 'nodes', data: expect.objectContaining({ id: 'workflow-plan:p1', kind: 'plan', sourceId: 'p1' }) }),
      expect.objectContaining({ group: 'nodes', data: expect.objectContaining({ id: 'workflow-task:a', kind: 'task', sourceId: 'a' }) }),
      expect.objectContaining({ group: 'nodes', data: expect.objectContaining({ id: 'workflow-task:b', kind: 'task', sourceId: 'b' }) }),
    ]);
    expect(elements.slice(3).map((element) => element.data)).toEqual([
      { id: 'contains:workflow-plan:p1->workflow-task:a', kind: 'contains', source: 'workflow-plan:p1', target: 'workflow-task:a' },
      { id: 'contains:workflow-plan:p1->workflow-task:b', kind: 'contains', source: 'workflow-plan:p1', target: 'workflow-task:b' },
      { id: 'depends_on:workflow-task:a->workflow-task:b', kind: 'depends_on', source: 'workflow-task:a', target: 'workflow-task:b' },
    ]);
  });

  it('does not add unsupported graph relationships or mutate the projection', () => {
    const before = structuredClone(graph);
    const elements = workflowGraphToCytoscapeElements(graph);

    expect(elements.every((element) => ['plan', 'task', 'contains', 'depends_on'].includes(element.data.kind))).toBe(true);
    expect(graph).toEqual(before);
  });

  it('handles an empty projection safely', () => {
    expect(workflowGraphToCytoscapeElements({ nodes: [], edges: [] })).toEqual([]);
  });

  it('maps a renderer selection back to the canonical graph node', () => {
    expect(workflowGraphNodeForSelection(graph, 'workflow-task:b')).toMatchObject({
      id: 'workflow-task:b',
      source: { kind: 'task', id: 'b' },
    });
    expect(workflowGraphNodeForSelection(graph, 'not-a-node')).toBeNull();
  });
});
