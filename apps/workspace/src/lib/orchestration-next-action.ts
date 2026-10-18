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
  /** True when the action requires a click to resolve; false for observational. */
  actionable: boolean;
}

/** Priority weight for sorting — lower = more urgent. */
const KIND_PRIORITY: Record<NextActionKind, number> = {
  'task-approval': 0,
  'task-failure': 1,
  'plan-approval': 2,
  resume: 3,
  progress: 4,
  start: 5,
};

function resolveProjectAction(
  project: NextActionProject,
  metrics: NextActionMetrics | undefined,
  approvals: NextActionApproval[] | undefined,
): NextAction | null {
  // 1. Task-level approvals — highest urgency, act inline on the card.
  if ((approvals?.length ?? 0) > 0) {
    return {
      kind: 'task-approval',
      projectId: project.id,
      projectName: project.name,
      title: `Approve ${approvals!.length} task${approvals!.length === 1 ? '' : 's'} in ${project.name}`,
      detail: approvals![0]?.summary ?? 'High-risk change awaiting review.',
      ctaLabel: 'Review approvals',
      actionable: true,
    };
  }

  // 2. Failed or blocked tasks surfaced via metrics.
  const stuck = (metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0);
  if (stuck > 0) {
    return {
      kind: 'task-failure',
      projectId: project.id,
      projectName: project.name,
      title: `Unblock ${project.name}`,
      detail: `${stuck} task${stuck === 1 ? '' : 's'} failed or blocked — review tasks to resume progress.`,
      ctaLabel: 'Open tasks',
      actionable: true,
    };
  }

  // 3. Plan awaiting the approval gateway.
  if (project.phase === 'pending-approval') {
    return {
      kind: 'plan-approval',
      projectId: project.id,
      projectName: project.name,
      title: `Approve plan for ${project.name}`,
      detail: 'Architecture review is complete — approve the plan to start execution.',
      ctaLabel: 'Approve plan',
      actionable: true,
    };
  }

  // 4. Paused work that can resume — only the executing phase can progress
  // via resume (backend resume() is a no-op for every other phase).
  // Task approvals, failures, plan approval, and verification are handled
  // by their own branches above/below.
  if (project.phase === 'executing' && project.status === 'running') {
    return {
      kind: 'resume',
      projectId: project.id,
      projectName: project.name,
      title: `Resume ${project.name}`,
      detail: `Status is ${project.status} — resume to continue the workflow.`,
      ctaLabel: 'Resume',
      actionable: true,
    };
  }

  // 5. Active execution worth inspecting.
  if (project.phase === 'executing' || project.phase === 'verifying') {
    const done = metrics ? `${metrics.tasks.completed}/${metrics.tasks.total} tasks complete` : 'Execution in progress';
    return {
      kind: 'progress',
      projectId: project.id,
      projectName: project.name,
      title: `Check progress in ${project.name}`,
      detail: `${done} — open the graph to inspect the active wave.`,
      ctaLabel: 'Open graph',
      actionable: false,
    };
  }

  // 6. Fallback: untouched project.
  return {
    kind: 'start',
    projectId: project.id,
    projectName: project.name,
    title: `Continue with ${project.name}`,
    detail: `Phase is ${project.phase} — expand the project to see its tasks and evidence.`,
    ctaLabel: 'View project',
    actionable: false,
  };
}

/**
 * Returns the single most urgent action across all projects, or a synthetic
 * empty-state action when no projects exist so the banner always has content.
 */
export function getNextAction(
  projects: NextActionProject[],
  metricsByProject: Record<string, NextActionMetrics>,
  approvalsByProject: Record<string, NextActionApproval[]>,
): NextAction | null {
  if (projects.length === 0) {
    return {
      kind: 'start',
      projectId: '',
      projectName: '',
      title: 'Create your first workflow',
      detail: 'Draft a goal, gate the risky steps, and let the agents run the waves.',
      ctaLabel: 'Create workflow',
      actionable: true,
    };
  }

  const actions: NextAction[] = [];
  for (const project of projects) {
    const action = resolveProjectAction(
      project,
      metricsByProject[project.id],
      approvalsByProject[project.id],
    );
    if (action) actions.push(action);
  }

  actions.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  return actions[0] ?? null;
}

/**
 * Returns the recommended action for a single project, or null if the project
 * is fully completed with no pending work.
 */
export function getProjectAction(
  project: NextActionProject,
  metrics: NextActionMetrics | undefined,
  approvals: NextActionApproval[] | undefined,
): NextAction | null {
  const action = resolveProjectAction(project, metrics, approvals);
  // Fully completed projects have no meaningful next action.
  if (project.status === 'completed' && !action) return null;
  return action;
}

/**
 * Returns all project-level actions sorted by priority (most urgent first).
 * Used for the "Next actions" inspector tab and rail badges.
 */
export function getNextActions(
  projects: NextActionProject[],
  metricsByProject: Record<string, NextActionMetrics>,
  approvalsByProject: Record<string, NextActionApproval[]>,
): NextAction[] {
  if (projects.length === 0) return [];

  const actions: NextAction[] = [];
  for (const project of projects) {
    const action = resolveProjectAction(
      project,
      metricsByProject[project.id],
      approvalsByProject[project.id],
    );
    if (action) actions.push(action);
  }

  actions.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  return actions;
}
