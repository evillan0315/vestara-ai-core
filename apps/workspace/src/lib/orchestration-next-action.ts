/**
 * Next recommended action for the Orchestration (Workflows) overview.
 *
 * Pure, deterministic resolver over data the page already fetches
 * (`projects`, `metricsByProject`, `approvalsByProject`). No new API calls.
 * Priority: task approvals → failed/blocked tasks → plan approval →
 * resume → in-progress inspection → untouched project.
 */

export interface NextActionProject {
  id: string;
  name: string;
  phase: string;
  status: string;
}

export interface NextActionMetrics {
  tasks: { total: number; completed: number; failed: number; blocked: number; awaitingApproval: number; running: number };
}

export interface NextActionApproval {
  id: string;
  summary: string;
}

export type NextActionKind =
  | 'task-approval'
  | 'task-failure'
  | 'plan-approval'
  | 'resume'
  | 'progress'
  | 'start';

export interface NextAction {
  kind: NextActionKind;
  projectId: string;
  projectName: string;
  title: string;
  detail: string;
  ctaLabel: string;
}

export function getNextAction(
  projects: NextActionProject[],
  metricsByProject: Record<string, NextActionMetrics>,
  approvalsByProject: Record<string, NextActionApproval[]>,
): NextAction | null {
  if (projects.length === 0) return null;

  // 1. Task-level approvals — highest urgency, act inline on the card.
  for (const project of projects) {
    const approvals = approvalsByProject[project.id] ?? [];
    if (approvals.length > 0) {
      return {
        kind: 'task-approval',
        projectId: project.id,
        projectName: project.name,
        title: `Approve ${approvals.length} task${approvals.length === 1 ? '' : 's'} in ${project.name}`,
        detail: approvals[0]?.summary ?? 'High-risk change awaiting review.',
        ctaLabel: 'Review approvals',
      };
    }
  }

  // 2. Failed or blocked tasks surfaced via metrics.
  for (const project of projects) {
    const metrics = metricsByProject[project.id];
    const stuck = (metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0);
    if (stuck > 0) {
      return {
        kind: 'task-failure',
        projectId: project.id,
        projectName: project.name,
        title: `Unblock ${project.name}`,
        detail: `${stuck} task${stuck === 1 ? '' : 's'} failed or blocked — review tasks to resume progress.`,
        ctaLabel: 'Open tasks',
      };
    }
  }

  // 3. Plan awaiting the approval gateway.
  const pendingPlan = projects.find((project) => project.phase === 'pending-approval');
  if (pendingPlan) {
    return {
      kind: 'plan-approval',
      projectId: pendingPlan.id,
      projectName: pendingPlan.name,
      title: `Approve plan for ${pendingPlan.name}`,
      detail: 'Architecture review is complete — approve the plan to start execution.',
      ctaLabel: 'Approve plan',
    };
  }

  // 4. Paused work that can resume (authoritative detail may add more).
  const resumable = projects.find(
    (project) => project.status === 'awaiting-approval' || project.status === 'running',
  );
  if (resumable) {
    return {
      kind: 'resume',
      projectId: resumable.id,
      projectName: resumable.name,
      title: `Resume ${resumable.name}`,
      detail: `Status is ${resumable.status} — resume to continue the workflow.`,
      ctaLabel: 'Resume',
    };
  }

  // 5. Active execution worth inspecting.
  const executing = projects.find((project) => project.phase === 'executing' || project.phase === 'verifying');
  if (executing) {
    const metrics = metricsByProject[executing.id];
    const done = metrics ? `${metrics.tasks.completed}/${metrics.tasks.total} tasks complete` : 'Execution in progress';
    return {
      kind: 'progress',
      projectId: executing.id,
      projectName: executing.name,
      title: `Check progress in ${executing.name}`,
      detail: `${done} — open the graph to inspect the active wave.`,
      ctaLabel: 'Open graph',
    };
  }

  // 6. Fallback: newest untouched project (list order is creation order).
  const first = projects[0];
  if (!first) return null;
  return {
    kind: 'start',
    projectId: first.id,
    projectName: first.name,
    title: `Continue with ${first.name}`,
    detail: `Phase is ${first.phase} — expand the project to see its tasks and evidence.`,
    ctaLabel: 'View project',
  };
}
