/**
 * WF-GRAPH-003: browser-side consumption boundary for the existing
 * WorkflowOrchestrator project snapshot.
 *
 * The orchestrator package is Node-oriented at runtime, so this adapter uses
 * its accepted graph contract as a type-only dependency and performs the same
 * pure, renderer-neutral projection locally. It does not add a transport
 * endpoint or create UI state.
 */

import type {
  PlanStatus,
  TaskStatus,
  WorkflowGraphEdge,
  WorkflowGraphProjection,
} from '@vestara/workflow-orchestrator';

export interface OrchestrationGraphSnapshot {
  readonly plan?: {
    readonly id: string;
    readonly title: string;
    readonly status: PlanStatus;
  };
  readonly tasks: readonly {
    readonly id: string;
    readonly planId: string;
    readonly summary: string;
    readonly status: TaskStatus;
    readonly dependencies: readonly string[];
  }[];
}

export function projectOrchestrationGraph(snapshot: OrchestrationGraphSnapshot): WorkflowGraphProjection {
  if (!snapshot.plan) throw new Error('Cannot project workflow graph without a selected WorkflowPlan');

  const plan = snapshot.plan;
  const tasks = snapshot.tasks.filter((task) => task.planId === plan.id).sort(byId);
  const planNodeId = nodeId('plan', plan.id);
  const taskIds = new Set(tasks.map((task) => task.id));

  const nodes: WorkflowGraphProjection['nodes'] = [
    {
      id: planNodeId,
      kind: 'plan',
      label: plan.title,
      status: plan.status,
      source: { kind: 'plan', id: plan.id },
    },
    ...tasks.map((task) => ({
      id: nodeId('task', task.id),
      kind: 'task' as const,
      label: task.summary,
      status: task.status,
      source: { kind: 'task' as const, id: task.id },
    })),
  ];

  const containsEdges: WorkflowGraphEdge[] = tasks.map((task) =>
    graphEdge('contains', planNodeId, nodeId('task', task.id)),
  );
  const dependencyEdges: WorkflowGraphEdge[] = tasks
    .flatMap((task) =>
      task.dependencies
        .filter((dependencyId) => taskIds.has(dependencyId))
        .map((dependencyId) => graphEdge('depends_on', nodeId('task', dependencyId), nodeId('task', task.id))),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return { nodes, edges: [...containsEdges, ...dependencyEdges] };
}

function nodeId(kind: 'plan' | 'task', sourceId: string): string {
  return `workflow-${kind}:${sourceId}`;
}

function graphEdge(
  kind: WorkflowGraphEdge['kind'],
  source: string,
  target: string,
): WorkflowGraphEdge {
  return { id: `${kind}:${source}->${target}`, source, target, kind };
}

function byId(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id.localeCompare(right.id);
}
