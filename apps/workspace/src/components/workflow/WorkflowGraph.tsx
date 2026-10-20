/**
 * WorkflowGraph — reusable plan/task dependency graph.
 *
 * Renders any {@link WorkflowGraphProjection} (orchestration snapshots,
 * adapters, fixtures) on a token-driven cytoscape canvas. Three chromes:
 *
 * - `panel` (default): WorkspaceOperationalPanel shell with title,
 *   description, legend, and zoom controls. Drop-in for full pages:
 *   `<WorkflowGraph graph={graph} selectedNodeId={id} onNodeSelect={...} />`
 * - `bare`: borderless canvas + toolbar only, for embedding inside drawers,
 *   context panels, modals, or other cards:
 *   `<WorkflowGraph chrome="bare" height={240} showLegend={false} graph={mini} />`
 * - `canvas`: fullscreen command-center canvas (Vestara Workflow
 *   Orchestration shell): orchestrator octagon, HTML node cards, floating
 *   legend, bottom zoom pill, and minimap. No panel furniture:
 *   `<WorkflowGraph chrome="canvas" height={560} graph={graph} ... />`
 *
 * Live updates apply in place (viewport preserved, fit on first mount
 * only). Nodes are freely draggable — a manual arrangement survives live
 * data updates and remounts (per-graph position cache) until a different
 * layout is picked. Selecting a node dims the rest for focus. All styling resolves
 * `--vestara-*` tokens at render time so dark/light follow automatically.
 * Node cards never fabricate data — they render label, kind, and status
 * from the projection only.
 */

import cytoscape from 'cytoscape';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorkflowGraphNode, WorkflowGraphProjection } from '@vestara/workflow-orchestrator';
import { navIcon } from '../../layouts/workspace-navigation';
import { workflowGraphNodeForSelection, workflowGraphToCytoscapeElements } from '../../lib/workflow-graph-cytoscape';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel';
import '../../styles/workflow-graph.css';

export type WorkflowGraphChrome = 'panel' | 'bare' | 'canvas';
export type WorkflowGraphLayoutName = 'breadthfirst' | 'concentric' | 'grid' | 'circle';

export interface WorkflowGraphProps {
  graph: WorkflowGraphProjection | null;
  error?: string;
  isLoading?: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: WorkflowGraphNode | null) => void;
  /** `panel` wraps in WorkspaceOperationalPanel; `bare` renders canvas only; `canvas` renders the command-center shell. */
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
  /**
   * Render rich HTML node cards over task nodes (title, status badge, meta).
   * Defaults to true for `canvas` chrome, false otherwise.
   */
  nodeCards?: boolean;
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

type CardTone = 'success' | 'running' | 'error' | 'warning' | 'muted';

function cardTone(status: string): CardTone {
  if (status === 'completed' || status === 'approved') return 'success';
  if (status === 'running' || status === 'in-progress') return 'running';
  if (status === 'blocked' || status === 'failed') return 'error';
  if (
    status === 'awaiting-approval' ||
    status === 'awaiting-verification' ||
    status === 'needs-review' ||
    status === 'pending'
  )
    return 'warning';
  return 'muted';
}

/** Static class literals only — Tailwind generates utilities from source text. */
const CARD_BORDER: Record<CardTone, string> = {
  success: 'border-[color-mix(in_srgb,var(--vestara-status-success)_45%,transparent)]',
  running: 'border-[color-mix(in_srgb,var(--vestara-status-running)_55%,transparent)]',
  error: 'border-[color-mix(in_srgb,var(--vestara-status-error)_55%,transparent)]',
  warning: 'border-[color-mix(in_srgb,var(--vestara-status-warning)_45%,transparent)]',
  muted: 'border-[var(--vestara-border-subtle)]',
};

const CARD_GLOW: Record<CardTone, string> = {
  success: 'shadow-[0_0_20px_-4px_var(--vestara-status-success)]',
  running: 'shadow-[0_0_24px_-4px_var(--vestara-status-running)]',
  error: 'shadow-[0_0_20px_-4px_var(--vestara-status-error)]',
  warning: 'shadow-[0_0_20px_-4px_var(--vestara-status-warning)]',
  muted: 'shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]',
};

const CARD_BADGE: Record<CardTone, string> = {
  success: 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]',
  running:
    'border-[color-mix(in_srgb,var(--vestara-status-running)_40%,transparent)] bg-[color-mix(in_srgb,var(--vestara-status-running)_12%,transparent)] text-[var(--vestara-status-running)]',
  error: 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]',
  warning: 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]',
  muted: 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-muted)]',
};

const CARD_ICON: Record<CardTone, string> = {
  success: 'border-[var(--vestara-status-success)] text-[var(--vestara-status-success)]',
  running: 'border-[var(--vestara-status-running)] text-[var(--vestara-status-running)]',
  error: 'border-[var(--vestara-status-error)] text-[var(--vestara-status-error)]',
  warning: 'border-[var(--vestara-status-warning)] text-[var(--vestara-status-warning)]',
  muted: 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]',
};

function prettyStatus(status: string): string {
  return status.replaceAll('-', ' ').toUpperCase();
}

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

function stylesheet(cards: boolean): cytoscape.StylesheetJson {
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
        width: 168,
        height: 168,
        shape: 'octagon',
        'font-size': '13px',
        'shadow-color': tokenValue('--vestara-accent-primary'),
        'shadow-blur': 26,
        'shadow-opacity': 0.4,
      },
    },
    {
      selector: 'node[kind = "task"]',
      style: {
        ...(cards
          ? {
              width: 12,
              height: 12,
              'background-opacity': 0,
              'border-width': 0,
              'shadow-blur': 0,
            }
          : { 'border-color': tokenValue('--vestara-status-info') }),
      },
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

function statusEdgeColor(status: string | undefined): string | null {
  if (status === 'running' || status === 'in-progress') return tokenValue('--vestara-status-running');
  if (status === 'blocked' || status === 'failed') return tokenValue('--vestara-status-error');
  return null;
}

function styledElements(graph: WorkflowGraphProjection, cards: boolean): cytoscape.ElementDefinition[] {
  const statusById = new Map(graph.nodes.map((node) => [node.id, node.status]));
  const base = workflowGraphToCytoscapeElements(graph);
  return base.map((element) => {
    if (element.group !== 'nodes') {
      if (element.group === 'edges' && element.data.kind === 'depends_on') {
        const targetStatus = statusById.get(element.data.target);
        const highlight = statusEdgeColor(targetStatus);
        if (highlight) {
          return {
            ...element,
            style: { 'line-color': highlight, 'target-arrow-color': highlight },
          };
        }
      }
      return element;
    }
    const node = graph.nodes.find((candidate) => candidate.id === element.data.id);
    if (!node) return element;
    if (node.kind === 'task' && cards) {
      return { ...element, data: { ...element.data, label: '' } };
    }
    if (node.kind === 'plan' && cards) {
      return { ...element, data: { ...element.data, label: `${node.label}\n${prettyStatus(node.status)}` } };
    }
    return {
      ...element,
      style: { 'border-color': nodeColor(node), 'background-color': nodeBackground(node) },
    };
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

interface GraphNodePosition {
  x: number;
  y: number;
}

/**
 * Per-graph manual-arrangement cache. Keyed by the sorted node-id set so an
 * arrangement follows its workflow across live updates and remounts (e.g.
 * tab switches) without ever touching domain state.
 */
const POSITION_CACHE = new Map<string, Record<string, GraphNodePosition>>();
const POSITION_CACHE_LIMIT = 20;

function positionCacheKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

function readCachedPositions(ids: readonly string[]): Record<string, GraphNodePosition> | undefined {
  return POSITION_CACHE.get(positionCacheKey(ids));
}

function writeCachedPositions(ids: readonly string[], positions: Record<string, GraphNodePosition>): void {
  const key = positionCacheKey(ids);
  POSITION_CACHE.delete(key);
  POSITION_CACHE.set(key, positions);
  while (POSITION_CACHE.size > POSITION_CACHE_LIMIT) {
    const oldest = POSITION_CACHE.keys().next();
    if (oldest.done) break;
    POSITION_CACHE.delete(oldest.value);
  }
}

function snapshotPositions(cy: cytoscape.Core): Record<string, GraphNodePosition> {
  const positions: Record<string, GraphNodePosition> = {};
  cy.nodes().forEach((node) => {
    const position = node.position();
    positions[node.id()] = { x: position.x, y: position.y };
  });
  return positions;
}

/**
 * Initial spots for nodes added after the user arranged the canvas: under
 * the average position of their known dependency predecessors, cascading
 * from the viewport center when there is no known predecessor. Auto-layout
 * stays out of the way so the manual arrangement is never disturbed.
 */
function positionsForAddedNodes(
  graph: WorkflowGraphProjection,
  addedIds: readonly string[],
  known: Record<string, GraphNodePosition>,
  fallback: GraphNodePosition,
): Record<string, GraphNodePosition> {
  const placed: Record<string, GraphNodePosition> = {};
  addedIds.forEach((id, index) => {
    const predecessors = graph.edges
      .filter((edge) => edge.kind === 'depends_on' && edge.target === id && known[edge.source])
      .map((edge) => known[edge.source]);
    if (predecessors.length > 0) {
      const averageX = predecessors.reduce((sum, position) => sum + position.x, 0) / predecessors.length;
      const lowestY = Math.max(...predecessors.map((position) => position.y));
      placed[id] = { x: averageX, y: lowestY + 120 };
    } else {
      placed[id] = {
        x: fallback.x + ((index % 3) - 1) * 120,
        y: fallback.y + Math.floor(index / 3) * 110,
      };
    }
  });
  return placed;
}

/** Status glyph for node cards: check, spinner, alert, or idle dot. */
function NodeCardGlyph({ status }: { status: string }) {
  const tone = cardTone(status);
  if (status === 'completed' || status === 'approved') {
    return (
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${CARD_ICON[tone]}`}
      >
        ✓
      </span>
    );
  }
  if (status === 'running' || status === 'in-progress') {
    return (
      <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
        <span className={`size-4 animate-spin rounded-full border-2 border-transparent ${CARD_ICON[tone]} border-t-current`} />
      </span>
    );
  }
  if (status === 'blocked' || status === 'failed') {
    return (
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${CARD_ICON[tone]}`}
      >
        !
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border ${CARD_ICON[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  );
}

function NodeCard({
  node,
  meta,
  selected,
  dimmed,
  position,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  node: WorkflowGraphNode;
  meta: string;
  selected: boolean;
  dimmed: boolean;
  position: { x: number; y: number };
  onSelect: (node: WorkflowGraphNode) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) => void;
}) {
  const tone = cardTone(node.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      onPointerDown={(event) => onPointerDown?.(event, node)}
      onPointerMove={(event) => onPointerMove?.(event, node)}
      onPointerUp={(event) => onPointerUp?.(event, node)}
      onPointerCancel={(event) => onPointerCancel?.(event, node)}
      aria-label={`${node.kind} ${node.label}, status ${prettyStatus(node.status)}. Drag to reposition.`}
      aria-pressed={selected}
      className={`pointer-events-auto w-52 cursor-grab touch-none select-none rounded-xl border bg-[var(--vestara-surface-panel)] p-3 text-left transition-opacity active:cursor-grabbing ${CARD_BORDER[tone]} ${CARD_GLOW[tone]} ${selected ? 'ring-2 ring-[var(--vestara-accent-primary)]' : ''} ${dimmed ? 'opacity-40' : ''}`}
      style={{ position: 'absolute', left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--vestara-font-size-xs)] font-semibold leading-snug text-[var(--vestara-text-primary)]">
          {node.label}
        </span>
        <NodeCardGlyph status={node.status} />
      </span>
      <span
        className={`mt-2 inline-block rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${CARD_BADGE[tone]}`}
      >
        {prettyStatus(node.status)}
      </span>
      <span className="mt-1.5 block truncate font-mono text-[10px] text-[var(--vestara-text-muted)]">{meta}</span>
    </button>
  );
}

/** Display-only minimap: node dots plus the current viewport rectangle. */
function GraphMinimap({ graph, cy }: { graph: WorkflowGraphProjection; cy: cytoscape.Core | null }) {
  if (!cy || graph.nodes.length === 0) return null;
  const positions = graph.nodes.map((node) => {
    try {
      const rendered = cy.getElementById(node.id);
      if (rendered.empty()) return null;
      return rendered.position();
    } catch {
      return null;
    }
  });
  const valid = positions.filter((position): position is { x: number; y: number } => position !== null);
  if (valid.length === 0) return null;
  const xs = valid.map((position) => position.x);
  const ys = valid.map((position) => position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 40;
  const spanX = Math.max(maxX - minX, 1) + pad * 2;
  const spanY = Math.max(maxY - minY, 1) + pad * 2;
  const width = 112;
  const height = 80;
  const scale = Math.min(width / spanX, height / spanY);
  const toSvg = (x: number, y: number): [number, number] => [
    (x - minX + pad) * scale + (width - spanX * scale) / 2,
    (y - minY + pad) * scale + (height - spanY * scale) / 2,
  ];
  let viewport: [number, number, number, number] | null = null;
  try {
    const extent = cy.extent();
    const [x1, y1] = toSvg(extent.x1, extent.y1);
    const [x2, y2] = toSvg(extent.x2, extent.y2);
    viewport = [Math.max(x1, 0), Math.max(y1, 0), Math.min(x2, width), Math.min(y2, height)];
  } catch {
    viewport = null;
  }
  const statusById = new Map(graph.nodes.map((node) => [node.id, node.status]));
  return (
    <div
      className="absolute bottom-3 right-3 rounded-[10px] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/90 p-2 backdrop-blur"
      aria-hidden="true"
    >
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-[var(--vestara-text-muted)]">Minimap</div>
      <svg width={width} height={height} className="block rounded-[6px] bg-[var(--vestara-surface-canvas)]">
        {valid.map((position, index) => {
          const [cx, cyDot] = toSvg(position.x, position.y);
          const status = statusById.get(graph.nodes[index]?.id ?? '') ?? '';
          return <circle key={graph.nodes[index]?.id ?? index} cx={cx} cy={cyDot} r={3} fill={`var(${statusToken[status] ?? '--vestara-text-muted'})`} />;
        })}
        {viewport && (
          <rect
            x={viewport[0]}
            y={viewport[1]}
            width={Math.max(viewport[2] - viewport[0], 4)}
            height={Math.max(viewport[3] - viewport[1], 4)}
            fill="none"
            stroke="var(--vestara-accent-primary)"
            strokeWidth={1}
          />
        )}
      </svg>
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="workflow-graph-legend" aria-label="Workflow graph legend">
      <span><i className="workflow-legend-swatch workflow-legend-plan" />Plan</span>
      <span><i className="workflow-legend-swatch workflow-legend-task" />Task</span>
      <span><i className="workflow-legend-line workflow-legend-contains" />Contains</span>
      <span><i className="workflow-legend-line workflow-legend-dependency" />Depends on</span>
      <span><i className="workflow-legend-swatch workflow-legend-completed" />Completed</span>
      <span><i className="workflow-legend-swatch workflow-legend-running" />Running</span>
      <span><i className="workflow-legend-swatch workflow-legend-pending" />Pending</span>
      <span><i className="workflow-legend-swatch workflow-legend-awaiting" />Needs approval</span>
      <span><i className="workflow-legend-swatch workflow-legend-blocked" />Blocker</span>
    </div>
  );
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
  layout = 'circle',
  height,
  className = '',
  emptyMessage = DEFAULT_EMPTY,
  nodeCards,
}: WorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const graphRef = useRef(graph);
  const onNodeSelectRef = useRef(onNodeSelect);
  const [cyCore, setCyCore] = useState<cytoscape.Core | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const rafQueuedRef = useRef(false);
  // Manual arrangement owns node positions once the user grabs any node;
  // the auto-layout only runs again on mount or an explicit layout change.
  const userPositionedRef = useRef(false);
  const prevLayoutRef = useRef(layout);
  // A canvas drag ends with a tap-shaped release — ignore the tap that
  // immediately follows a real drag so arranging never selects.
  const lastDragEndRef = useRef(0);
  // A card drag ends with a click — swallow the click that follows a move.
  const suppressClickRef = useRef(false);
  const cardDragRef = useRef<{
    pointerId: number;
    nodeId: string;
    startClientX: number;
    startClientY: number;
    startModelX: number;
    startModelY: number;
    moved: boolean;
  } | null>(null);
  const cards = nodeCards ?? chrome === 'canvas';
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
        writeCachedPositions(
          cyRef.current.nodes().map((node) => node.id()),
          snapshotPositions(cyRef.current),
        );
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setCyCore(null);
      return;
    }

    const queueViewportSync = () => {
      if (rafQueuedRef.current) return;
      rafQueuedRef.current = true;
      requestAnimationFrame(() => {
        rafQueuedRef.current = false;
        const cy = cyRef.current;
        if (!cy) return;
        setZoomPct(Math.round(cy.zoom() * 100));
        setViewportTick((tick) => tick + 1);
      });
    };

    const elements = styledElements(graph, cards);
    let cy = cyRef.current;
    if (!cy) {
      cy = cytoscape({
        container,
        elements,
        style: stylesheet(cards),
        layout: buildLayout(layout),
        minZoom: 0.45,
        maxZoom: 2.2,
        wheelSensitivity: 0.2,
      });
      cyRef.current = cy;
      setCyCore(cy);

      const handleTap = (event: cytoscape.EventObject) => {
        if (Date.now() - lastDragEndRef.current < 350) return;
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
      cy.on('pan zoom', queueViewportSync);
      cy.on('position', queueViewportSync);
      cy.on('drag', 'node', () => {
        userPositionedRef.current = true;
      });
      cy.on('dragfree', 'node', () => {
        lastDragEndRef.current = Date.now();
        const live = cyRef.current;
        const projection = graphRef.current;
        if (live && projection) {
          writeCachedPositions(
            live.nodes().map((node) => node.id()),
            snapshotPositions(live),
          );
        }
      });
      cy.fit(undefined, GRAPH_FIT_PADDING);
      // A previous manual arrangement for this exact node set wins over the
      // fresh auto-layout (e.g. returning from another tab).
      const cached = readCachedPositions(graph.nodes.map((node) => node.id));
      if (cached) {
        cy.nodes().forEach((node) => {
          const saved = cached[node.id()];
          if (saved) node.position(saved);
        });
        userPositionedRef.current = true;
        cy.fit(undefined, GRAPH_FIT_PADDING);
      }
      prevLayoutRef.current = layout;
      queueViewportSync();
    } else {
      // In-place live update: viewport preserved, no fit after first mount.
      const pan = cy.pan();
      const zoom = cy.zoom();
      const knownPositions = snapshotPositions(cy);
      const prevIds = new Set(Object.keys(knownPositions));
      cy.batch(() => {
        cy?.elements().remove();
        cy?.add(elements);
      });
      const layoutChanged = prevLayoutRef.current !== layout;
      const addedIds = graph.nodes.filter((node) => !prevIds.has(node.id)).map((node) => node.id);
      if (layoutChanged || !userPositionedRef.current) {
        cy.layout(buildLayout(layout)).run();
        if (layoutChanged) userPositionedRef.current = false;
      } else {
        cy.nodes().forEach((node) => {
          const saved = knownPositions[node.id()];
          if (saved) node.position(saved);
        });
        if (addedIds.length > 0) {
          const extent = cy.extent();
          const placed = positionsForAddedNodes(
            graph,
            addedIds,
            knownPositions,
            { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 },
          );
          for (const [id, position] of Object.entries(placed)) {
            const added = cy.getElementById(id);
            if (added.nonempty()) added.position(position);
          }
        }
      }
      prevLayoutRef.current = layout;
      writeCachedPositions(
        cy.nodes().map((node) => node.id()),
        snapshotPositions(cy),
      );
      cy.viewport({ zoom, pan });
    }
    syncSelection(cy, selectedNodeId);

    const resizeObserver = new ResizeObserver(() => cyRef.current?.resize());
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
    // selectedNodeId intentionally excluded: selection syncs via the dedicated effect below.
  }, [graphSignature, layout, cards]);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy) syncSelection(cy, selectedNodeId);
  }, [selectedNodeId, graphSignature]);

  useEffect(
    () => () => {
      const cy = cyRef.current;
      if (cy) {
        writeCachedPositions(
          cy.nodes().map((node) => node.id()),
          snapshotPositions(cy),
        );
        cy.destroy();
      }
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
    setZoomPct(Math.round((cy.zoom() ?? 1) * 100));
    setViewportTick((tick) => tick + 1);
  };

  const canvasStyle = height === undefined ? undefined : { height: typeof height === 'number' ? `${height}px` : height };

  // Card (HTML overlay) dragging: the cards sit above the canvas so the
  // gesture starts here, then moves the underlying cytoscape node in model
  // coordinates. Below the movement threshold the gesture stays a click.
  const handleCardPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: WorkflowGraphNode) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const cy = cyRef.current;
    if (!cy) return;
    const element = cy.getElementById(node.id);
    if (element.empty()) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = element.position();
    cardDragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startModelX: start.x,
      startModelY: start.y,
      moved: false,
    };
  };

  const handleCardPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = cardDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const cy = cyRef.current;
    if (!cy) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    const element = cy.getElementById(drag.nodeId);
    if (element.empty()) return;
    const zoom = cy.zoom() || 1;
    element.position({ x: drag.startModelX + deltaX / zoom, y: drag.startModelY + deltaY / zoom });
    userPositionedRef.current = true;
    setViewportTick((tick) => tick + 1);
  };

  const endCardDrag = (event: ReactPointerEvent<HTMLButtonElement>, swallowClick: boolean) => {
    const drag = cardDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    cardDragRef.current = null;
    if (!drag.moved) return;
    const cy = cyRef.current;
    if (cy) {
      writeCachedPositions(
        cy.nodes().map((node) => node.id()),
        snapshotPositions(cy),
      );
    }
    if (swallowClick) suppressClickRef.current = true;
  };

  const handleCardPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    endCardDrag(event, true);
  };

  const handleCardPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    endCardDrag(event, false);
  };

  // Positions read during render drive the HTML overlay + minimap.
  void viewportTick;

  const taskNodes = cards && graph ? graph.nodes.filter((node) => node.kind === 'task') : [];
  const dependsCount = (nodeId: string): number =>
    graph?.edges.filter((edge) => edge.kind === 'depends_on' && edge.target === nodeId).length ?? 0;

  const cardsOverlay =
    cards && graph && cyCore ? (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {taskNodes.map((node) => {
          let rendered: { x: number; y: number } | null = null;
          try {
            const element = cyCore.getElementById(node.id);
            if (element.nonempty()) rendered = element.renderedPosition();
          } catch {
            rendered = null;
          }
          if (!rendered) return null;
          return (
            <NodeCard
              key={node.id}
              node={node}
              meta={`${node.kind} · ${dependsCount(node.id)} dep`}
              selected={selectedNodeId === node.id}
              dimmed={Boolean(selectedNodeId) && selectedNodeId !== node.id}
              position={rendered}
              onSelect={(selected) => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                const full = graphRef.current ? workflowGraphNodeForSelection(graphRef.current, selected.id) : null;
                onNodeSelectRef.current?.(full);
              }}
              onPointerDown={handleCardPointerDown}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
            />
          );
        })}
      </div>
    ) : null;

  const minimap = chrome === 'canvas' && graph && cyCore ? <GraphMinimap graph={graph} cy={cyCore} /> : null;

  const zoomPill = (
    <div
      className="absolute bottom-3 left-3 flex items-center gap-1 rounded-[10px] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/90 p-1 backdrop-blur"
      role="group"
      aria-label="Graph zoom controls"
    >
      <button
        type="button"
        className="workflow-graph-control"
        disabled={!graph}
        onClick={() => zoomBy(1 / 1.25)}
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="min-w-12 px-1 text-center font-mono text-[10px] text-[var(--vestara-text-muted)]" aria-live="polite">
        {zoomPct}%
      </span>
      <button type="button" className="workflow-graph-control" disabled={!graph} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
        +
      </button>
      <button
        type="button"
        className="workflow-graph-control"
        disabled={!graph}
        onClick={() => cyRef.current?.fit(undefined, GRAPH_FIT_PADDING)}
      >
        Fit view
      </button>
    </div>
  );

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
    <div ref={containerRef} className="workflow-graph-canvas relative" role="img" aria-label="Workflow graph" style={canvasStyle}>
      {chrome === 'canvas' && cardsOverlay}
    </div>
  );

  const toolbar = (showLegend || showControls) && (
    <div className="workflow-graph-toolbar">
      {showLegend ? (
        <GraphLegend />
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

  if (chrome === 'canvas') {
    return (
      <div className={`relative min-h-0 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] ${className}`}>
        {showLegend && (
          <div className="absolute left-3 top-3 z-10 rounded-[10px] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/90 px-3 py-2 backdrop-blur">
            <GraphLegend />
          </div>
        )}
        {!selectedNodeId && graph && graph.nodes.length > 0 && (
          <div className="workflow-graph-hint" aria-hidden="true">
            Select a node to inspect
          </div>
        )}
        {content}
        {showControls && zoomPill}
        {minimap}
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
