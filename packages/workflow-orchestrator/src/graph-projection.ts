/**
 * WF-GRAPH-002: pure adapter from an authoritative WorkflowOrchestrator
 * snapshot to the minimal renderer-neutral graph contract.
 */

import {
  workflowGraphEdgeId,
  workflowGraphNodeId,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
  type WorkflowGraphProjection,
} from './graph-contract';
import type { ProjectSnapshot, WorkflowPlan, WorkflowTask } from './types';

export type WorkflowGraphSnapshot = Pick<ProjectSnapshot, 'plan' | 'tasks'>;

/**
 * Project the selected plan and its authoritative tasks.
 *
 * The API snapshot can contain tasks for more than one historical plan, so
 * only tasks whose persisted planId matches the selected plan are included.
 * A dependency that is not present in that selected task set is omitted: the
 * orchestrator permits missing dependency references during scheduling, and
 * this projector must not fabricate a node or infer a target.
 */
export function projectWorkflowGraph(snapshot: WorkflowGraphSnapshot): WorkflowGraphProjection {
  const plan = requirePlan(snapshot.plan);
  const tasks = snapshot.tasks.filter((task) => task.planId === plan.id).sort(byId);
  const planNodeId = workflowGraphNodeId('plan', plan.id);

  const nodes: WorkflowGraphNode[] = [planNode(plan, planNodeId), ...tasks.map((task) => taskNode(task))];
  const taskIds = new Set(tasks.map((task) => task.id));
  const containsEdges = tasks.map((task) =>
    edge('contains', planNodeId, workflowGraphNodeId('task', task.id)),
  );
  const dependencyEdges = tasks
    .flatMap((task) =>
      task.dependencies
        .filter((dependencyId) => taskIds.has(dependencyId))
        .map((dependencyId) =>
          edge(
            'depends_on',
            workflowGraphNodeId('task', dependencyId),
            workflowGraphNodeId('task', task.id),
          ),
        ),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    nodes,
    edges: [...containsEdges, ...dependencyEdges],
  };
}

function requirePlan(plan: WorkflowPlan | undefined): WorkflowPlan {
  if (!plan) throw new Error('Cannot project workflow graph without a selected WorkflowPlan');
  return plan;
}

function planNode(plan: WorkflowPlan, id: string): WorkflowGraphNode {
  return {
    id,
    kind: 'plan',
    label: plan.title,
    status: plan.status,
    source: { kind: 'plan', id: plan.id },
  };
}

function taskNode(task: WorkflowTask): WorkflowGraphNode {
  return {
    id: workflowGraphNodeId('task', task.id),
    kind: 'task',
    label: task.summary,
    status: task.status,
    source: { kind: 'task', id: task.id },
  };
}

function edge(kind: WorkflowGraphEdge['kind'], source: string, target: string): WorkflowGraphEdge {
  return { id: workflowGraphEdgeId(kind, source, target), source, target, kind };
}

function byId(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id.localeCompare(right.id);
}
