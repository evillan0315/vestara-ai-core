/**
 * WorkflowGraph — reusable plan/task dependency graph.
 *
 * Renders any {@link WorkflowGraphProjection} (orchestration snapshots,
 * adapters, fixtures) on a token-driven cytoscape canvas. Two chromes:
 *
 * - `panel` (default): WorkspaceOperationalPanel shell with title,
 *   description, legend, and zoom controls. Drop-in for full pages:
 *   `<WorkflowGraph graph={graph} selectedNodeId={id} onNodeSelect={...} />`
 * - `bare`: borderless canvas + toolbar only, for embedding inside drawers,
 *   context panels, modals, or other cards:
 *   `<WorkflowGraph chrome="bare" height={240} showLegend={false} graph={mini} />`
 *
 * Live updates apply in place (viewport preserved, fit on first mount
 * only). Selecting a node dims the rest for focus. All styling resolves
 * `--vestara-*` tokens at render time so dark/light follow automatically.
 */

import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { WorkflowGraphNode, WorkflowGraphProjection } from '@vestara/workflow-orchestrator';
import { navIcon } from '../../layouts/workspace-navigation';
import { workflowGraphNodeForSelection, workflowGraphToCytoscapeElements } from '../../lib/workflow-graph-cytoscape';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel';
import '../../styles/workflow-graph.css';

export type WorkflowGraphChrome = 'panel' | 'bare';
export type WorkflowGraphLayoutName = 'breadthfirst' | 'concentric' | 'grid' | 'circle';

export interface WorkflowGraphProps {
  graph: WorkflowGraphProjection | null;
  error?: string;
  isLoading?: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: WorkflowGraphNode | null) => void;
  /** `panel` wraps in WorkspaceOperationalPanel; `bare` renders canvas only. */
  chrome?: WorkflowGraphChrome;
  title?: string;
  description?: string;
  showLegend?: boolean;
  /** Zoom in/out/fit controls in the toolbar. */
  showControls?: boolean;
  layout?: WorkflowGraphLayoutName;
  /** Canvas height (px number or CSS string). Defaults to the stylesheet. */
  height?: number | string;
  className?: string;
  emptyMessage?: string;
}

const DEFAULT_TITLE = 'Workflow graph';
const DEFAULT_DESCRIPTION = 'Plan and task dependencies from the current orchestration snapshot';
const DEFAULT_EMPTY = 'Select a workflow project to view its graph.';

/** Viewport fit margin — tight enough that the graph reads edge-to-edge. */
const GRAPH_FIT_PADDING = 12;
/** Layout breathing room around ranked nodes. */
const GRAPH_LAYOUT_PADDING = 16;

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

const statusBackgroundToken: Record<string, string> = {
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

function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || `var(${name})`;
}

function nodeColor(node: WorkflowGraphNode): string {
  return tokenValue(statusToken[node.status] ?? '--vestara-status-unknown');
}

function nodeBackground(node: WorkflowGraphNode): string {
  return tokenValue(statusBackgroundToken[node.status] ?? '--vestara-surface-panel-raised');
}

function buildLayout(name: WorkflowGraphLayoutName): cytoscape.LayoutOptions {
  switch (name) {
    case 'concentric':
      return { name: 'concentric', fit: true, padding: GRAPH_LAYOUT_PADDING, startAngle: Math.PI / 2, minNodeSpacing: 36 };
    case 'grid':
      return { name: 'grid', fit: true, padding: GRAPH_LAYOUT_PADDING, rows: undefined };
    case 'circle':
      return { name: 'circle', fit: true, padding: GRAPH_LAYOUT_PADDING, startAngle: Math.PI / 2 };
    case 'breadthfirst':
    default:
      return { name: 'breadthfirst', directed: true, spacingFactor: 1.2, fit: true, padding: GRAPH_LAYOUT_PADDING };
  }
}

function stylesheet(): cytoscape.StylesheetJson {
  // Cytoscape 3.34's bundled types omit the runtime-valid `shadow-*` node
  // styles, so entries are built loosely and cast once at this boundary.
  const entries: Array<{ selector: string; style: Record<string, string | number> }> = [
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
        'background-opacity': 0.92,
        'border-width': 2,
        'border-color': tokenValue('--vestara-border-default'),
        'border-opacity': 1,
        width: 172,
        height: 68,
        shape: 'round-rectangle',
        'shadow-blur': 14,
        'shadow-opacity': 0.22,
        'shadow-color': tokenValue('--vestara-border-strong'),
        'shadow-offset-x': 0,
        'shadow-offset-y': 6,
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
        'shadow-color': tokenValue('--vestara-accent-primary'),
        'shadow-blur': 22,
        'shadow-opacity': 0.35,
      },
    },
    {
      selector: 'node[kind = "task"]',
      style: { 'border-color': tokenValue('--vestara-status-info') },
    },
    // Live-work glow: running tasks read as lit from within.
    {
      selector: 'node[status = "running"], node[status = "in-progress"]',
      style: {
        'border-width': 3,
        'shadow-color': tokenValue('--vestara-status-running'),
        'shadow-blur': 26,
        'shadow-opacity': 0.5,
      },
    },
    {
      selector: 'node[status = "failed"], node[status = "blocked"]',
      style: {
        'border-width': 3,
        'shadow-color': tokenValue('--vestara-status-error'),
        'shadow-blur': 24,
        'shadow-opacity': 0.45,
      },
    },
    {
      selector: 'node[status = "completed"], node[status = "approved"]',
      style: {
        'shadow-color': tokenValue('--vestara-status-success'),
        'shadow-blur': 16,
        'shadow-opacity': 0.28,
      },
    },
    {
      selector: 'node.hover',
      style: {
        'border-color': tokenValue('--vestara-accent-primary'),
        'overlay-color': tokenValue('--vestara-accent-primary'),
        'overlay-opacity': 0.08,
        'overlay-padding': 6,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-color': tokenValue('--vestara-accent-primary'),
        'border-width': 3,
        'overlay-color': tokenValue('--vestara-accent-primary'),
        'overlay-opacity': 0.12,
        'overlay-padding': 6,
        'shadow-color': tokenValue('--vestara-accent-primary'),
        'shadow-blur': 28,
        'shadow-opacity': 0.5,
      },
    },
    {
      selector: 'node.dimmed',
      style: { opacity: 0.35 },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': tokenValue('--vestara-border-strong'),
        'target-arrow-color': tokenValue('--vestara-border-strong'),
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.15,
        'line-cap': 'round',
        'curve-style': 'bezier',
      },
    },
    {
      selector: 'edge.dimmed',
      style: { opacity: 0.22 },
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
  ];
  return entries as cytoscape.StylesheetJson;
}

function styledElements(graph: WorkflowGraphProjection): cytoscape.ElementDefinition[] {
  return workflowGraphToCytoscapeElements(graph).map((element) => {
    if (element.group !== 'nodes') return element;
    const node = graph.nodes.find((candidate) => candidate.id === element.data.id);
    return node
      ? { ...element, style: { 'border-color': nodeColor(node), 'background-color': nodeBackground(node) } }
      : element;
  });
}

function syncSelection(cy: cytoscape.Core, selectedNodeId?: string) {
  cy.nodes().unselect();
  cy.nodes().removeClass('dimmed');
  cy.edges().removeClass('dimmed');
  if (!selectedNodeId) return;
  const selected = cy.getElementById(selectedNodeId);
  if (selected.nonempty()) {
    selected.select();
    cy.nodes().not(selected).addClass('dimmed');
    cy.edges().not(selected.connectedEdges()).addClass('dimmed');
  }
}

export function WorkflowGraph({
  graph,
  error,
  isLoading = false,
  selectedNodeId,
  onNodeSelect,
  chrome = 'panel',
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  showLegend = true,
  showControls = true,
  layout = 'breadthfirst',
  height,
  className = '',
  emptyMessage = DEFAULT_EMPTY,
}: WorkflowGraphProps) {
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
    const container = containerRef.current;
    if (!container || !graph) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      return;
    }

    const elements = styledElements(graph);
    let cy = cyRef.current;
    if (!cy) {
      cy = cytoscape({
        container,
        elements,
        style: stylesheet(),
        layout: buildLayout(layout),
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
      const handleHoverIn = (event: cytoscape.EventObject) => event.target.addClass('hover');
      const handleHoverOut = (event: cytoscape.EventObject) => event.target.removeClass('hover');
      cy.on('tap', 'node', handleTap);
      cy.on('tap', handleBackgroundTap);
      cy.on('mouseover', 'node', handleHoverIn);
      cy.on('mouseout', 'node', handleHoverOut);
      cy.fit(undefined, GRAPH_FIT_PADDING);
    } else {
      // In-place live update: viewport preserved, no fit after first mount.
      const pan = cy.pan();
      const zoom = cy.zoom();
      cy.batch(() => {
        cy?.elements().remove();
        cy?.add(elements);
      });
      cy.layout(buildLayout(layout)).run();
      cy.viewport({ zoom, pan });
    }
    syncSelection(cy, selectedNodeId);

    const resizeObserver = new ResizeObserver(() => cyRef.current?.resize());
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
    // selectedNodeId intentionally excluded: selection syncs via the dedicated effect below.
  }, [graphSignature, layout]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy) syncSelection(cy, selectedNodeId);
  }, [selectedNodeId, graphSignature]);

  useEffect(
    () => () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    },
    [],
  );

  const zoomBy = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    const extent = cy.extent();
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 },
    });
  };

  const canvasStyle = height === undefined ? undefined : { height: typeof height === 'number' ? `${height}px` : height };

  const content = error ? (
    <div className="workflow-graph-empty">{error}</div>
  ) : isLoading && !graph ? (
    <div className="workflow-graph-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Loading workflow graph">
      <div className="mpg-skeleton h-64" />
      <p className="sr-only">Loading workflow graph…</p>
    </div>
  ) : !graph ? (
    <div className="workflow-graph-empty">{emptyMessage}</div>
  ) : graph.nodes.length === 0 ? (
    <div className="workflow-graph-empty">No workflow graph data is available.</div>
  ) : (
    <div ref={containerRef} className="workflow-graph-canvas" role="img" aria-label="Workflow graph" style={canvasStyle} />
  );

  const toolbar = (showLegend || showControls) && (
    <div className="workflow-graph-toolbar">
      {showLegend ? (
        <div className="workflow-graph-legend" aria-label="Workflow graph legend">
          <span><i className="workflow-legend-swatch workflow-legend-plan" />Plan</span>
          <span><i className="workflow-legend-swatch workflow-legend-task" />Task</span>
          <span><i className="workflow-legend-line workflow-legend-contains" />Contains</span>
          <span><i className="workflow-legend-line workflow-legend-dependency" />Depends on</span>
        </div>
      ) : (
        <span />
      )}
      {showControls && (
        <div className="workflow-graph-controls" role="group" aria-label="Graph view controls">
          <button type="button" className="workflow-graph-control" disabled={!graph} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="workflow-graph-control" disabled={!graph} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="workflow-graph-control" disabled={!graph} onClick={() => cyRef.current?.fit(undefined, GRAPH_FIT_PADDING)}>
            Fit view
          </button>
        </div>
      )}
    </div>
  );

  if (chrome === 'bare') {
    return (
      <div className={`workflow-graph-bare ${className}`}>
        <div className="workflow-graph-shell">
          {toolbar}
          {content}
        </div>
      </div>
    );
  }

  return (
    <WorkspaceOperationalPanel
      icon={navIcon('workflows')}
      title={title}
      description={description}
      className={`workflow-graph-panel ${className}`}
    >
      <div className="workflow-graph-shell">
        {toolbar}
        {content}
      </div>
    </WorkspaceOperationalPanel>
  );
}
