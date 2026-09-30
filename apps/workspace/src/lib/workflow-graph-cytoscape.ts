import type cytoscape from 'cytoscape';
import type { WorkflowGraphNode, WorkflowGraphProjection } from '@vestara/workflow-orchestrator';

export type WorkflowGraphElementData = {
  id: string;
  kind: 'plan' | 'task' | 'contains' | 'depends_on';
  label?: string;
  status?: string;
  sourceKind?: 'plan' | 'task';
  sourceId?: string;
  source?: string;
  target?: string;
};

/** Converts the renderer-neutral projection without changing its semantics. */
export function workflowGraphToCytoscapeElements(
  graph: WorkflowGraphProjection,
): cytoscape.ElementDefinition[] {
  return [
    ...graph.nodes.map((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        kind: node.kind,
        label: node.label,
        status: node.status,
        sourceKind: node.source.kind,
        sourceId: node.source.id,
      },
    })),
    ...graph.edges.map((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        kind: edge.kind,
        source: edge.source,
        target: edge.target,
      },
    })),
  ];
}

export function workflowGraphNodeForSelection(
  graph: WorkflowGraphProjection,
  nodeId: string,
): WorkflowGraphNode | null {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}
