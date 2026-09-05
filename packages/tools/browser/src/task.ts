/**
 * @vestara/tools-browser — Browser Task Model (LB-005)
 *
 * Every browser objective becomes a bounded task with traceable steps.
 * This gives the Browser Agent a structured execution model rather
 * than an opaque "AI is browsing" operation.
 */

// ─── Task status ────────────────────────────────────────────

export type BrowserTaskStatus = 'pending' | 'running' | 'waiting-for-user' | 'completed' | 'failed' | 'cancelled';

export type BrowserStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

// ─── Step action types ──────────────────────────────────────

export type BrowserStepAction =
  | 'navigate'
  | 'observe'
  | 'click'
  | 'type'
  | 'scroll'
  | 'wait'
  | 'select'
  | 'back'
  | 'forward'
  | 'reload'
  | 'extract'
  | 'screenshot'
  | 'custom';

// ─── Browser Step ───────────────────────────────────────────

/**
 * A single step within a browser task. Each step represents one
 * atomic browser operation with its inputs, outputs, and status.
 */
export interface BrowserStep {
  readonly id: string;
  readonly task_id: string;
  readonly index: number;

  /** Human-readable description of what this step does. */
  readonly description: string;

  /** The browser action this step performs. */
  readonly action: BrowserStepAction;

  /** Action-specific input parameters. */
  readonly input: Readonly<Record<string, unknown>>;

  /** Step execution status. */
  status: BrowserStepStatus;

  /** Output produced by the step (set on completion). */
  output?: Readonly<Record<string, unknown>>;

  /** Error message if the step failed. */
  error?: string;

  /** Observation ID if this step produced an observation. */
  observation_id?: string;

  /** Element ref used by this step (for click/type steps). */
  element_ref?: string;

  /** Timestamps. */
  started_at?: string;
  completed_at?: string;

  /** Duration in milliseconds. */
  duration_ms?: number;

  /** Evidence artifact IDs produced by this step. */
  evidence_ids: readonly string[];
}

// ─── Browser Task ───────────────────────────────────────────

/**
 * A bounded browser task with traceable execution structure.
 * The Browser Agent creates tasks; the Browser Runtime executes them.
 */
export interface BrowserTask {
  readonly id: string;
  readonly session_id: string;
  readonly owner_id: string;

  /** Natural language description of the task objective. */
  readonly objective: string;

  /** Current task status. */
  status: BrowserTaskStatus;

  /** Ordered list of execution steps. */
  steps: readonly BrowserStep[];

  /** The URL where the task started. */
  readonly start_url?: string;

  /** The URL where the task ended. */
  final_url?: string;

  /** Final result summary (set on completion). */
  result_summary?: string;

  /** Error message if the task failed. */
  error?: string;

  /** Timestamps. */
  created_at: string;
  started_at?: string;
  completed_at?: string;

  /** Total duration in milliseconds. */
  duration_ms?: number;

  /** Evidence artifact IDs produced by the task. */
  evidence_ids: readonly string[];
}

// ─── Task Builder ───────────────────────────────────────────

let stepCounter = 0;

/**
 * Create a new browser task with a unique ID.
 */
export function createBrowserTask(
  sessionId: string,
  ownerId: string,
  objective: string,
  startUrl?: string,
): BrowserTask {
  return {
    id: `task-${Date.now()}-${++stepCounter}`,
    session_id: sessionId,
    owner_id: ownerId,
    objective,
    status: 'pending',
    steps: [],
    start_url: startUrl,
    created_at: new Date().toISOString(),
    evidence_ids: [],
  };
}

/**
 * Add a step to a browser task. Returns the new step.
 */
export function addBrowserStep(
  task: BrowserTask,
  description: string,
  action: BrowserStepAction,
  input: Readonly<Record<string, unknown>> = {},
): BrowserStep {
  const step: BrowserStep = {
    id: `${task.id}-s${task.steps.length + 1}`,
    task_id: task.id,
    index: task.steps.length + 1,
    description,
    action,
    input,
    status: 'pending',
    evidence_ids: [],
  };
  // Note: task.steps is readonly, so the caller must handle immutability.
  // This function returns the step for the caller to append.
  return step;
}

/**
 * Mark a step as running.
 */
export function startStep(step: BrowserStep): void {
  step.status = 'running';
  step.started_at = new Date().toISOString();
}

/**
 * Mark a step as completed with optional output.
 */
export function completeStep(step: BrowserStep, output?: Readonly<Record<string, unknown>>): void {
  step.status = 'completed';
  step.output = output;
  step.completed_at = new Date().toISOString();
  if (step.started_at) {
    step.duration_ms = Date.now() - new Date(step.started_at).getTime();
  }
}

/**
 * Mark a step as failed with an error message.
 */
export function failStep(step: BrowserStep, error: string): void {
  step.status = 'failed';
  step.error = error;
  step.completed_at = new Date().toISOString();
  if (step.started_at) {
    step.duration_ms = Date.now() - new Date(step.started_at).getTime();
  }
}

/**
 * Start a task (mark as running).
 */
export function startTask(task: BrowserTask): void {
  task.status = 'running';
  task.started_at = new Date().toISOString();
}

/**
 * Complete a task successfully.
 */
export function completeTask(task: BrowserTask, resultSummary: string, finalUrl?: string): void {
  task.status = 'completed';
  task.result_summary = resultSummary;
  task.final_url = finalUrl;
  task.completed_at = new Date().toISOString();
  if (task.started_at) {
    task.duration_ms = Date.now() - new Date(task.started_at).getTime();
  }
}

/**
 * Fail a task with an error message.
 */
export function failTask(task: BrowserTask, error: string): void {
  task.status = 'failed';
  task.error = error;
  task.completed_at = new Date().toISOString();
  if (task.started_at) {
    task.duration_ms = Date.now() - new Date(task.started_at).getTime();
  }
}

/**
 * Get a summary of task execution for evidence/reports.
 */
export function summarizeTask(task: BrowserTask): {
  readonly objective: string;
  readonly status: BrowserTaskStatus;
  readonly steps_total: number;
  readonly steps_completed: number;
  readonly steps_failed: number;
  readonly duration_ms?: number;
  readonly final_url?: string;
  readonly result_summary?: string;
} {
  const completed = task.steps.filter((s) => s.status === 'completed').length;
  const failed = task.steps.filter((s) => s.status === 'failed').length;
  return {
    objective: task.objective,
    status: task.status,
    steps_total: task.steps.length,
    steps_completed: completed,
    steps_failed: failed,
    duration_ms: task.duration_ms,
    final_url: task.final_url,
    result_summary: task.result_summary,
  };
}
