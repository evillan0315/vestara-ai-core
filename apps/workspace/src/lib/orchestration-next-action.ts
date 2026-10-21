/**
 * Next recommended action for the Orchestration (Workflows) overview.
 *
 * Pure, deterministic resolver over data the page already fetches
 * (`projects`, `metricsByProject`, `approvalsByProject`). No new API calls.
 * Priority: task approvals → failed/blocked tasks → architecture review →
 * plan approval → resume → in-progress inspection → untouched project.
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
  /** ISO timestamp when the approval became pending (preferred for age). */
  updatedAt?: string;
  /** ISO timestamp when the task was created (fallback for age). */
  createdAt?: string;
  /** Alias some callers use for the pending-since timestamp. */
  requestedAt?: string;
}

export interface NextActionTaskRef {
  id: string;
  dependencies: readonly string[];
  /** When present, completed/cancelled tasks are not counted as held up. */
  status?: string;
}

export type NextActionKind =
  | 'task-approval'
  | 'task-failure'
  | 'architecture-review'
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
  'architecture-review': 2,
  'plan-approval': 3,
  resume: 4,
  progress: 5,
  start: 6,
};

/**
 * W4 — priority weight for a single action kind. Exposed so the projects
 * rail sorts by the same ladder the resolver uses (never a second ladder).
 */
export function getActionPriority(kind: NextActionKind): number {
  return KIND_PRIORITY[kind];
}

function parseApprovalTime(approval: NextActionApproval): number | null {
  const raw = approval.updatedAt ?? approval.requestedAt ?? approval.createdAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Coarse age bucket for the oldest pending approval. Buckets (s/m/h/d) keep
 * the banner signature stable within the bucket — the recommendation re-shows
 * only when the bucket changes, not on every refresh.
 */
export function formatApprovalAge(ageMs: number): string {
  const clamped = Math.max(0, ageMs);
  const seconds = Math.floor(clamped / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/** Oldest pending-approval age in ms, or null when no approval carries a parsable timestamp. */
export function oldestPendingApprovalAge(approvals: readonly NextActionApproval[]): number | null {
  let oldest: number | null = null;
  for (const approval of approvals) {
    const timestamp = parseApprovalTime(approval);
    if (timestamp === null) continue;
    if (oldest === null || timestamp < oldest) oldest = timestamp;
  }
  if (oldest === null) return null;
  return Math.max(0, Date.now() - oldest);
}

/**
 * Counts tasks held up by the pending approvals: transitive dependents of any
 * approval id, excluding the approvals themselves. Completed/cancelled tasks
 * are not counted when their status is known. Returns null when the task
 * graph is unavailable so callers omit the count (never zero-fill).
 */
export function countHeldUpTasks(
  approvals: readonly NextActionApproval[],
  tasks: readonly NextActionTaskRef[] | undefined,
): number | null {
  if (!tasks) return null;
  const pending = new Set(approvals.map((approval) => approval.id));
  if (pending.size === 0) return null;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      const list = dependents.get(dependency);
      if (list) list.push(task.id);
      else dependents.set(dependency, [task.id]);
    }
  }
  const visited = new Set<string>(pending);
  const queue = [...pending];
  let heldUp = 0;
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const dependentId of dependents.get(current) ?? []) {
      if (visited.has(dependentId)) continue;
      visited.add(dependentId);
      queue.push(dependentId);
      const dependent = byId.get(dependentId);
      if (dependent?.status === 'completed' || dependent?.status === 'cancelled') continue;
      heldUp += 1;
    }
  }
  return heldUp;
}

function nameApproval(approval: NextActionApproval): string {
  const summary = approval.summary?.trim();
  if (summary) return summary;
  return approval.id?.trim() ? `Approval ${approval.id.trim()}` : 'High-risk change awaiting review.';
}

/**
 * Builds the why-now detail for a task-approval action: names every pending
 * item, then appends the oldest-waiting age and the held-up dependent count
 * only when the data supports them (never zero-filled placeholders).
 */
export function buildApprovalDetail(
  approvals: readonly NextActionApproval[],
  tasks?: readonly NextActionTaskRef[] | undefined,
): string {
  const names = approvals.map(nameApproval);
  const base =
    names.length <= 1 ? (names[0] ?? 'High-risk change awaiting review.') : `${names.length} pending: ${names.join('; ')}`;
  const suffixes: string[] = [];
  const oldestAge = oldestPendingApprovalAge(approvals);
  if (oldestAge !== null) suffixes.push(`waiting ${formatApprovalAge(oldestAge)}`);
  const heldUp = countHeldUpTasks(approvals, tasks);
  if (heldUp !== null && heldUp > 0) suffixes.push(`holding up ${heldUp} task${heldUp === 1 ? '' : 's'}`);
  if (suffixes.length === 0) return base;
  return `${base} — ${suffixes.join(', ')}`;
}

function resolveProjectAction(
  project: NextActionProject,
  metrics: NextActionMetrics | undefined,
  approvals: NextActionApproval[] | undefined,
  tasks?: readonly NextActionTaskRef[] | undefined,
): NextAction | null {
  // 1. Task-level approvals — highest urgency, act inline on the card.
  if ((approvals?.length ?? 0) > 0) {
    return {
      kind: 'task-approval',
      projectId: project.id,
      projectName: project.name,
      title: `Approve ${approvals!.length} task${approvals!.length === 1 ? '' : 's'} in ${project.name}`,
      detail: buildApprovalDetail(approvals!, tasks),
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

  // 3. Plan awaiting the architecture review gate.
  if (project.phase === 'architecture') {
    return {
      kind: 'architecture-review',
      projectId: project.id,
      projectName: project.name,
      title: `Review architecture for ${project.name}`,
      detail: 'The plan is proposed — approve it or request changes before director approval.',
      ctaLabel: 'Review gate',
      actionable: true,
    };
  }

  // 4. Plan awaiting the director approval gateway.
  if (project.phase === 'pending-approval') {
    return {
      kind: 'plan-approval',
      projectId: project.id,
      projectName: project.name,
      title: `Approve plan for ${project.name}`,
      detail: 'Architecture review is complete — approve or reject the plan before execution.',
      ctaLabel: 'Review approval',
      actionable: true,
    };
  }

  // 5. Paused work that can resume — only the executing phase can progress
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

  // 6. Active execution worth inspecting.
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

  // 7. Fallback: untouched project.
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
  tasksByProject?: Record<string, readonly NextActionTaskRef[]>,
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
      tasksByProject?.[project.id],
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
  tasks?: readonly NextActionTaskRef[] | undefined,
): NextAction | null {
  const action = resolveProjectAction(project, metrics, approvals, tasks);
  // Fully completed projects have no meaningful next action.
  if (project.status === 'completed' && !action) return null;
  return action;
}

/**
 * Returns all project-level actions sorted by priority (most urgent first).
 * Used for the "Next actions" inspector tab and rail badges.
 *
 * W1: callers pass the *visible* project set (after rail search + status
 * filter) so no recommended action targets a project the rail has hidden.
 * An empty visible set yields no actions — the filtered-empty state is the
 * rail's "No workflows match" empty state, never a synthetic create action.
 */
export function getNextActions(
  projects: NextActionProject[],
  metricsByProject: Record<string, NextActionMetrics>,
  approvalsByProject: Record<string, NextActionApproval[]>,
  tasksByProject?: Record<string, readonly NextActionTaskRef[]>,
): NextAction[] {
  if (projects.length === 0) return [];

  const actions: NextAction[] = [];
  for (const project of projects) {
    const action = resolveProjectAction(
      project,
      metricsByProject[project.id],
      approvalsByProject[project.id],
      tasksByProject?.[project.id],
    );
    if (action) actions.push(action);
  }

  actions.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  return actions;
}

/**
 * W4 — short badge label for a resolved action. Counts derive from the same
 * inputs the resolver uses (approvals length, metrics failed+blocked) so the
 * rail badge can never disagree with the resolver output. Fixed-kind labels
 * (`review plan`, `review architecture`, …) carry no count.
 */
export function getActionBadgeLabel(
  action: NextAction,
  approvals?: readonly NextActionApproval[],
  metrics?: NextActionMetrics,
): string {
  switch (action.kind) {
    case 'task-approval': {
      const count = approvals?.length;
      if (count !== undefined && count > 0) return `${count} approval${count === 1 ? '' : 's'}`;
      return 'approvals';
    }
    case 'task-failure': {
      const stuck = (metrics?.tasks.failed ?? 0) + (metrics?.tasks.blocked ?? 0);
      if (stuck > 0) return `${stuck} blocked`;
      return 'blocked';
    }
    case 'architecture-review':
      return 'review architecture';
    case 'plan-approval':
      return 'review plan';
    case 'resume':
      return 'resume';
    case 'progress':
      return 'in progress';
    case 'start':
      return 'start';
  }
}

/**
 * W4 — stable priority ordering for the projects rail.
 *
 * Sorts any caller-supplied project list (typically the filtered
 * `visibleProjects`) by the resolver's `KIND_PRIORITY` ladder via the
 * already-resolved `actionsById` map. Ties preserve input order (stable),
 * so existing search/status filters are preserved — sorting never adds or
 * removes rows, it only reorders them. Projects without a resolved action
 * sort last, preserving their relative order.
 */
export function sortProjectsByActionPriority<P extends NextActionProject>(
  projects: readonly P[],
  actionsById: Readonly<Record<string, NextAction | null | undefined>>,
): P[] {
  const FALLBACK_PRIORITY = 99;
  return projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const actionA = actionsById[a.project.id];
      const actionB = actionsById[b.project.id];
      const priorityA = actionA ? KIND_PRIORITY[actionA.kind] : FALLBACK_PRIORITY;
      const priorityB = actionB ? KIND_PRIORITY[actionB.kind] : FALLBACK_PRIORITY;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.index - b.index;
    })
    .map((entry) => entry.project);
}

/**
 * W1 — scoped next-action resolution for the filtered rail.
 *
 * Resolves over the *visible* project set so the banner, overview queue, and
 * inspector queue never target a project the active search/status filter has
 * hidden. Unfiltered behaviour is unchanged (visible === all).
 *
 * Empty handling is explicit: an empty workspace still yields the synthetic
 * create-workflow action, but an empty *filtered* set (projects exist, none
 * visible) yields null so the rail's "No workflows match" empty state owns
 * the moment instead of a misleading create CTA.
 */
export function getScopedNextAction(
  visibleProjects: NextActionProject[],
  totalProjects: number,
  metricsByProject: Record<string, NextActionMetrics>,
  approvalsByProject: Record<string, NextActionApproval[]>,
  tasksByProject?: Record<string, readonly NextActionTaskRef[]>,
): NextAction | null {
  if (visibleProjects.length === 0) {
    if (totalProjects === 0) return getNextAction([], metricsByProject, approvalsByProject, tasksByProject);
    return null;
  }
  return getNextAction(visibleProjects, metricsByProject, approvalsByProject, tasksByProject);
}

/**
 * Stable 32-bit FNV-1a hash (hex) of banner content.
 *
 * The banner dismissal signature is `kind|projectId|contentHash` where the
 * content hash covers the rendered title/detail/CTA. For task-level actions
 * the pending approval count is encoded in the title ("Approve 2 tasks..."),
 * so a changed count yields a new signature and re-shows the banner.
 * Crucially the signature never includes the dashboard attention count, so
 * phase-level recommendations (plan-approval / architecture-review) with
 * zero task-level attention can stay dismissed.
 */
export function hashBannerContent(content: string): string {
  let hash = 0x811c9dc5;
  for (const char of content) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds the dismissal signature for the next-action banner. Returns null
 * when there is no recommendation. Depends only on the recommendation
 * itself — never on the dashboard attention count.
 */
export function buildBannerSignature(action: NextAction | null): string | null {
  if (!action) return null;
  const content = `${action.title}|${action.detail}|${action.ctaLabel}|${action.actionable ? '1' : '0'}`;
  return `${action.kind}|${action.projectId}|${hashBannerContent(content)}`;
}

/**
 * True when the banner for `signature` was dismissed. A cleared (null)
 * dismissal or a changed recommendation (signature mismatch) re-shows the
 * banner — this is the header chip restore path and the recommendation-change
 * path. There is intentionally no attention-count reset here: an
 * attention===0 cleanup belongs to the header chip episode only, never to
 * the banner.
 */
export function isBannerDismissed(dismissedSignature: string | null, signature: string | null): boolean {
  return signature !== null && dismissedSignature === signature;
}

/**
 * True when a stored banner dismissal went stale because the recommendation
 * changed. Clearing the stale value ends the dismissal episode so it can
 * never suppress new work that happens to reuse an old signature.
 */
export function shouldClearStaleBannerDismissal(
  dismissedSignature: string | null,
  signature: string | null,
): boolean {
  return dismissedSignature !== null && signature !== null && dismissedSignature !== signature;
}

/**
 * W3 — persistent Next lane queue helpers.
 *
 * The lane cycles the full recommended-action list (`getNextActions` order)
 * while honouring the W0 dismissal episode: a stored dismissal suppresses
 * only the single matching item, never the whole lane.
 */

/** Suppresses only the dismissed item from the lane queue. Null dismissal = no-op. */
export function filterDismissedNextActions(
  actions: readonly NextAction[],
  dismissedSignature: string | null,
): NextAction[] {
  if (dismissedSignature === null) return [...actions];
  return actions.filter((action) => buildBannerSignature(action) !== dismissedSignature);
}

/**
 * True when the stored dismissal no longer matches any action in the current
 * queue — the recommendation set changed, so the episode ends and the stored
 * value can be cleared. Never clears while the dismissed item is still queued
 * (the lane keeps skipping it) and never clears when nothing is stored.
 */
export function shouldClearStaleQueueDismissal(
  dismissedSignature: string | null,
  actions: readonly NextAction[],
): boolean {
  if (dismissedSignature === null) return false;
  if (actions.length === 0) return false;
  return !actions.some((action) => buildBannerSignature(action) === dismissedSignature);
}
