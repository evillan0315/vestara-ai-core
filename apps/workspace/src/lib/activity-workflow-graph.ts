/**
 * Activity stream → workflow graph projection.
 *
 * Builds a {@link WorkflowGraphProjection} for ONE workflow run from M11C
 * stream items so the Activity Room can render a mini workflow graph
 * (bare chrome) inside the detail drawer. Pure projection — no state
 * mutation, no fetching.
 *
 * Honesty contract (mirrors M11CWorkflowBrowser's derivation home):
 * - Nodes: one plan node for the workflow run + one node per distinct
 *   taskId observed on that run's items.
 * - Edges: `contains` (plan → task) only. The stream carries no task
 *   dependency data, so `depends_on` edges are never inferred.
 * - Task status heuristic (same vocabulary as deriveWorkflowUnits):
 *   failures pin (`failed`), then active lifecycle (`in-progress`), then
 *   completion language (`completed`), otherwise `pending`.
 * - Plan status: the authoritative WorkflowSummary wins when it names this
 *   run; otherwise it derives from the task roll-up (failures →
 *   `needs-revision`, active work → `executing`, all done → `completed`).
 * - Absent stays absent: items without taskId still prove the run exists
 *   (plan-only graph); unknown runs project to null.
 */

import type {
  PlanStatus,
  TaskStatus,
  WorkflowGraphProjection,
} from '@vestara/workflow-orchestrator';
import { workflowGraphEdgeId, workflowGraphNodeId } from '@vestara/workflow-orchestrator';
import type { WorkflowSummary } from '@vestara/activity-room';
import type { M11CStreamItem } from '../hooks/useM11CActivityRoom';

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function taskStatusForEvents(events: readonly M11CStreamItem[]): TaskStatus {
  // Authoritative failure class is 'diagnostic' (M10 classifyKind); accept
  // legacy 'error' so older projections still surface.
  if (events.some((item) => item.kind === 'diagnostic' || item.kind === 'error')) return 'failed';
  if (events.some((item) => item.kind === 'activity' && item.content.includes('completed'))) return 'completed';
  if (events.some((item) => item.kind === 'activity' || item.kind === 'progress')) return 'in-progress';
  return 'pending';
}

function planStatusFromTasks(taskStatuses: readonly TaskStatus[]): PlanStatus {
  if (taskStatuses.includes('failed')) return 'needs-revision';
  if (taskStatuses.includes('in-progress')) return 'executing';
  if (taskStatuses.length > 0 && taskStatuses.every((status) => status === 'completed')) return 'completed';
  return 'approved';
}

function planStatusFromSummary(status: string, fallback: PlanStatus): PlanStatus {
  switch (status) {
    case 'running':
      return 'executing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'needs-revision';
    case 'cancelled':
      return 'cancelled';
    default:
      return fallback;
  }
}

export function projectActivityStreamWorkflowGraph(
  stream: readonly M11CStreamItem[],
  workflowRunId: string,
  workflowSummary: WorkflowSummary | null = null,
): WorkflowGraphProjection | null {
  const items = stream.filter((item) => item.workflowRunId === workflowRunId);
  if (items.length === 0) return null;

  const planNodeId = workflowGraphNodeId('plan', workflowRunId);

  // Distinct tasks in first-seen order for a stable layout.
  const taskIds: string[] = [];
  const eventsByTask = new Map<string, M11CStreamItem[]>();
  for (const item of items) {
    if (!item.taskId) continue;
    const events = eventsByTask.get(item.taskId);
    if (events) {
      events.push(item);
    } else {
      eventsByTask.set(item.taskId, [item]);
      taskIds.push(item.taskId);
    }
  }

  const taskStatuses = taskIds.map((taskId) => taskStatusForEvents(eventsByTask.get(taskId) ?? []));
  const derivedPlanStatus = planStatusFromTasks(taskStatuses);
  const planStatus =
    workflowSummary && workflowSummary.workflowRunId === workflowRunId
      ? planStatusFromSummary(workflowSummary.status, derivedPlanStatus)
      : derivedPlanStatus;

  return {
    nodes: [
      {
        id: planNodeId,
        kind: 'plan',
        label: `wf:${shortId(workflowRunId)}`,
        status: planStatus,
        source: { kind: 'plan', id: workflowRunId },
      },
      ...taskIds.map((taskId, index) => ({
        id: workflowGraphNodeId('task', taskId),
        kind: 'task' as const,
        label: shortId(taskId),
        status: taskStatuses[index],
        source: { kind: 'task' as const, id: taskId },
      })),
    ],
    edges: taskIds.map((taskId) => {
      const target = workflowGraphNodeId('task', taskId);
      return {
        id: workflowGraphEdgeId('contains', planNodeId, target),
        source: planNodeId,
        target,
        kind: 'contains' as const,
      };
    }),
  };
}
