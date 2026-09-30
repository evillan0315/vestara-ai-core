import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { WorkflowGraphNode, WorkflowGraphProjection } from '@vestara/workflow-orchestrator';
import { navIcon } from '../../layouts/workspace-navigation';
import { workflowGraphNodeForSelection, workflowGraphToCytoscapeElements } from '../../lib/workflow-graph-cytoscape';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel';
import '../../styles/workflow-graph.css';

interface WorkflowGraphProps {
  graph: WorkflowGraphProjection | null;
  error?: string;
  selectedNodeId?: string;
  onNodeSelect?: (node: WorkflowGraphNode | null) => void;
}

const statusToken: Record<string, string> = {
  completed: '--vestara-status-success',
  approved: '--vestara-status-success',
  'in-progress': '--vestara-status-running',
  running: '--vestara-status-running',
  pending: '--vestara-status-pending',
  ready: '--vestara-status-info',
  'awaiting-approval': '--vestara-status-warning',
  'awaiting-verification': '--vestara-status-warning',
  'needs-review': '--vestara-status-warning',
  blocked: '--vestara-status-error',
  failed: '--vestara-status-error',
  cancelled: '--vestara-status-disabled',
};

function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || `var(${name})`;
}

function nodeColor(node: WorkflowGraphNode): string {
  return tokenValue(statusToken[node.status] ?? '--vestara-status-unknown');
}

function nodeBackground(node: WorkflowGraphNode): string {
  const token: Record<string, string> = {
    completed: '--vestara-status-success-bg',
    approved: '--vestara-status-success-bg',
    'in-progress': '--vestara-status-info-bg',
    running: '--vestara-status-info-bg',
    pending: '--vestara-surface-panel-raised',
    ready: '--vestara-status-info-bg',
    'awaiting-approval': '--vestara-status-warning-bg',
    'awaiting-verification': '--vestara-status-warning-bg',
    'needs-review': '--vestara-status-warning-bg',
    blocked: '--vestara-status-error-bg',
    failed: '--vestara-status-error-bg',
    cancelled: '--vestara-surface-panel-raised',
  };
  return tokenValue(token[node.status] ?? '--vestara-surface-panel-raised');
}

export function WorkflowGraph({ graph, error, selectedNodeId, onNodeSelect }: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graphRef = useRef(graph);
  const onNodeSelectRef = useRef(onNodeSelect);
  const graphSignature = graph
    ? JSON.stringify({
        nodes: graph.nodes.map((node) => [node.id, node.kind, node.label, node.status, node.source.kind, node.source.id]),
        edges: graph.edges.map((edge) => [edge.id, edge.kind, edge.source, edge.target]),
      })
    : '';

  graphRef.current = graph;
  onNodeSelectRef.current = onNodeSelect;

  useEffect(() => {
    if (!containerRef.current || !graph) return;

    const graphElements = workflowGraphToCytoscapeElements(graph).map((element) => {
      if (element.group !== 'nodes') return element;
      const node = graph.nodes.find((candidate) => candidate.id === element.data.id);
      return node
        ? { ...element, style: { 'border-color': nodeColor(node), 'background-color': nodeBackground(node) } }
        : element;
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements: graphElements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: tokenValue('--vestara-text-primary'),
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '138px',
            'font-size': '12px',
            'font-weight': 600,
            'background-color': tokenValue('--vestara-surface-panel-raised'),
            'border-width': 2,
            'border-color': tokenValue('--vestara-border-default'),
            width: 172,
            height: 68,
            shape: 'round-rectangle',
          },
        },
        {
          selector: 'node[kind = "plan"]',
          style: {
            'background-color': tokenValue('--vestara-accent-bg'),
            'border-color': tokenValue('--vestara-accent-primary'),
            width: 188,
            height: 74,
            'font-size': '13px',
          },
        },
        {
          selector: 'node[kind = "task"]',
          style: { 'border-color': tokenValue('--vestara-status-info') },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': tokenValue('--vestara-accent-primary'),
            'border-width': 4,
            'overlay-color': tokenValue('--vestara-accent-primary'),
            'overlay-opacity': 0.12,
            'overlay-padding': 6,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': tokenValue('--vestara-border-strong'),
            'target-arrow-color': tokenValue('--vestara-border-strong'),
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge[kind = "contains"]',
          style: {
            'line-color': tokenValue('--vestara-accent-primary'),
            'target-arrow-color': tokenValue('--vestara-accent-primary'),
            'line-style': 'dashed',
          },
        },
        {
          selector: 'edge[kind = "depends_on"]',
          style: {
            'line-color': tokenValue('--vestara-status-info'),
            'target-arrow-color': tokenValue('--vestara-status-info'),
          },
        },
      ],
      layout: { name: 'breadthfirst', directed: true, spacingFactor: 1.25, fit: true, padding: 32 },
      minZoom: 0.45,
      maxZoom: 2.2,
      wheelSensitivity: 0.2,
    });

    cyRef.current = cy;

    const handleTap = (event: cytoscape.EventObject) => {
      const node = graphRef.current ? workflowGraphNodeForSelection(graphRef.current, event.target.id()) : null;
      onNodeSelectRef.current?.(node);
    };
    const handleBackgroundTap = (event: cytoscape.EventObject) => {
      if (event.target === cy) onNodeSelectRef.current?.(null);
    };
    cy.on('tap', 'node', handleTap);
    cy.on('tap', handleBackgroundTap);

    const resizeObserver = new ResizeObserver(() => cy.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cy.removeListener('tap', 'node', handleTap);
      cy.removeListener('tap', handleBackgroundTap);
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphSignature]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedNodeId) cy.getElementById(selectedNodeId).select();
  }, [selectedNodeId, graphSignature]);

  const content = error ? (
    <div className="workflow-graph-empty">{error}</div>
  ) : !graph ? (
    <div className="workflow-graph-empty">Select a workflow project to view its graph.</div>
  ) : graph.nodes.length === 0 ? (
    <div className="workflow-graph-empty">No workflow graph data is available.</div>
  ) : (
    <div ref={containerRef} className="workflow-graph-canvas" aria-label="Workflow graph" />
  );

  return (
    <WorkspaceOperationalPanel
      icon={navIcon('workflows')}
      title="Workflow graph"
      description="Plan and task dependencies from the current orchestration snapshot"
      actions={<button type="button" className="workflow-graph-control" disabled={!graph} onClick={() => cyRef.current?.fit(undefined, 32)}>Fit view</button>}
      className="workflow-graph-panel"
    >
      <div className="workflow-graph-shell">
        <div className="workflow-graph-toolbar">
          <div className="workflow-graph-legend" aria-label="Workflow graph legend">
            <span><i className="workflow-legend-swatch workflow-legend-plan" />Plan</span>
            <span><i className="workflow-legend-swatch workflow-legend-task" />Task</span>
            <span><i className="workflow-legend-line workflow-legend-contains" />Contains</span>
            <span><i className="workflow-legend-line workflow-legend-dependency" />Depends on</span>
          </div>
        </div>
        {content}
      </div>
    </WorkspaceOperationalPanel>
  );
}
