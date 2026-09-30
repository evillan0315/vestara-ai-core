/**
 * WF-GRAPH-001: minimal renderer-neutral graph contract for the durable
 * WorkflowOrchestrator topology.
 *
 * This contract starts at a WorkflowPlan. The containing project remains page
 * context, not a graph node. Graph state is derived from authoritative
 * project/plan/task state and does not own workflow state.
 */

import type { PlanStatus, TaskStatus } from './types';

export type WorkflowGraphNodeKind = 'plan' | 'task';

export type WorkflowGraphEdgeKind = 'contains' | 'depends_on';

export interface WorkflowGraphSourceRef<K extends WorkflowGraphNodeKind = WorkflowGraphNodeKind> {
  /** The authoritative WorkflowOrchestrator entity kind. */
  readonly kind: K;
  /** The authoritative entity identity; never a display label or array index. */
  readonly id: string;
}

export interface WorkflowGraphPlanNode {
  readonly id: string;
  readonly kind: 'plan';
  readonly label: string;
  readonly status: PlanStatus;
  readonly source: WorkflowGraphSourceRef<'plan'>;
}

export interface WorkflowGraphTaskNode {
  readonly id: string;
  readonly kind: 'task';
  readonly label: string;
  readonly status: TaskStatus;
  readonly source: WorkflowGraphSourceRef<'task'>;
}

export type WorkflowGraphNode = WorkflowGraphPlanNode | WorkflowGraphTaskNode;

export interface WorkflowGraphEdge {
  /** Deterministically derived from kind, source node ID, and target node ID. */
  readonly id: string;
  /** Graph node ID, not a display label or renderer-generated ID. */
  readonly source: string;
  /** Graph node ID, not a display label or renderer-generated ID. */
  readonly target: string;
  readonly kind: WorkflowGraphEdgeKind;
}

export interface WorkflowGraphProjection {
  readonly nodes: readonly WorkflowGraphNode[];
  readonly edges: readonly WorkflowGraphEdge[];
}

/**
 * Canonical graph-node identity namespaces for WorkflowOrchestrator entities.
 * These values are presentation-independent and reversible with the source
 * reference carried by each node.
 */
export const WORKFLOW_GRAPH_NODE_PREFIX = {
  plan: 'workflow-plan',
  task: 'workflow-task',
} as const;

/**
 * Construct a stable graph ID from an authoritative source identity.
 */
export function workflowGraphNodeId(kind: WorkflowGraphNodeKind, sourceId: string): string {
  return `${WORKFLOW_GRAPH_NODE_PREFIX[kind]}:${sourceId}`;
}

/**
 * Construct a stable edge ID from its semantic kind and endpoint graph IDs.
 */
export function workflowGraphEdgeId(kind: WorkflowGraphEdgeKind, source: string, target: string): string {
  return `${kind}:${source}->${target}`;
}

/**
 * Dependency direction is deliberately opposite the stored dependency list:
 * when task B.dependencies contains task A.id, the graph edge is A → B.
 * This represents the orchestrator's execution prerequisite: A must complete
 * before B can become ready.
 */
export const WORKFLOW_GRAPH_DEPENDENCY_DIRECTION = 'prerequisite_to_dependent' as const;
