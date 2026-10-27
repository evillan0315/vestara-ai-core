/**
 * Orchestration project templates — client access to the authoritative
 * creation presets served by `GET /api/orchestration/templates`.
 *
 * Used by the Orchestration creation surface (prefill) and by the assistant
 * "Start from a template" section (navigate + prefill, or explicit run).
 * Never declares template names or task rows inline — the WorkflowOrchestrator
 * catalog is the single source of truth.
 */

export interface OrchestrationTemplateTask {
  readonly summary: string;
  readonly files: readonly string[];
  readonly requiredCapabilities: readonly string[];
}

export interface OrchestrationTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly goal: string;
  readonly tasks: readonly OrchestrationTemplateTask[];
}

export interface OrchestrationProjectDraft {
  readonly name: string;
  readonly goal: string;
  readonly repoPath?: string;
  readonly tasks: ReadonlyArray<{
    readonly summary: string;
    readonly files: readonly string[];
    readonly requiredCapabilities: readonly string[];
  }>;
}

const API = '/api/orchestration';

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // Non-JSON error body — fall through to the status message.
  }
  return `Request failed (${res.status})`;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

/** Fetch the authoritative preset catalog. Tolerant: [] when unavailable. */
export async function fetchOrchestrationTemplates(): Promise<OrchestrationTemplate[]> {
  try {
    const res = await fetch(`${API}/templates`);
    if (!res.ok) return [];
    const data = (await res.json()) as { templates?: OrchestrationTemplate[] };
    return Array.isArray(data.templates) ? data.templates : [];
  } catch {
    return [];
  }
}

/** Project draft prefilled from a template — no execution. */
export function draftFromOrchestrationTemplate(template: OrchestrationTemplate): OrchestrationProjectDraft {
  return {
    name: template.name,
    goal: template.goal,
    tasks: template.tasks.map((task) => ({
      summary: task.summary,
      files: [...task.files],
      requiredCapabilities: [...task.requiredCapabilities],
    })),
  };
}

/**
 * Create and run an orchestrated project through the existing phase sequence
 * (create → start → analysis → plan → architecture → approve → execute).
 *
 * This is the explicit execution path. It must only be invoked after the user
 * chooses "Create & run" (never from a passive suggestion render), and the
 * server still enforces the `editor` role on every call.
 */
export async function createAndRunOrchestrationProject(draft: OrchestrationProjectDraft): Promise<string> {
  const created = await postJson<{ project: { id: string } }>('/projects', {
    name: draft.name,
    goal: draft.goal,
    repoPath: draft.repoPath,
  });
  const projectId = created.project.id;
  await postJson(`/projects/${projectId}/start`);
  await postJson(`/projects/${projectId}/analysis`, { analystId: 'agent-analyst', report: {} });
  await postJson(`/projects/${projectId}/plan`, {
    plannerId: 'agent-planner',
    title: draft.name,
    goal: draft.goal,
    tasks: draft.tasks.map((task) => ({
      summary: task.summary,
      description: '',
      files: [...task.files],
      dependencies: [],
      effort: 'medium',
      requiredCapabilities: [...task.requiredCapabilities],
    })),
  });
  await postJson(`/projects/${projectId}/architecture`, { architectId: 'agent-architect', status: 'approved' });
  await postJson(`/projects/${projectId}/approve`, {});
  await postJson(`/projects/${projectId}/execute`);
  return projectId;
}
