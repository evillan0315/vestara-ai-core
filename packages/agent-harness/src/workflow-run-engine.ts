/**
 * ARX-015 M8: WorkflowRunEngine — Workflow Orchestration Authority
 *
 * The engine is the single writer of workflow state. It owns:
 * - Task lifecycle state machine (pending → runnable → running → terminal)
 * - DAG dependency resolution (task becomes runnable only when deps satisfy)
 * - Idempotent workflow run creation (one execution identity → one run)
 * - Failure propagation (failed prerequisite blocks dependents)
 * - Retry/resume (preserves WorkflowRun identity and completed evidence)
 *
 * Architecture invariant:
 *   WorkflowRun owns orchestration state
 *   RuntimeSessionBinding (M7) owns runtime continuity
 *   ExecutionSession owns execution/evidence
 *   ResolvedAiBinding (M4) owns AI provider/model
 *   RepositoryBinding (M5) owns repository authority
 *
 * The engine does NOT:
 * - Select provider/model (M4 authority)
 * - Create physical sessions (M7 authority)
 * - Resolve repository paths (M5 authority)
 * - Execute agent runs (harness runtime)
 */

import type {
  RepositoryBindingId,
  RuntimeSessionId,
  WorkflowEvent,
  WorkflowEventCallback,
  WorkflowEventType,
  WorkflowPlan,
  WorkflowPlanId,
  WorkflowRun,
  WorkflowRunId,
  WorkflowRunStartInput,
  WorkflowRunStartResult,
  WorkflowRunStatus,
  WorkflowTaskCompleteInput,
  WorkflowTaskCompleteResult,
  WorkflowTaskDefinition,
  WorkflowTaskId,
  WorkflowTaskInstance,
  WorkflowTaskStatus,
} from '@vestara/types';

// ─── ID Generation ──────────────────────────────────────────

let nextTaskInstanceCounter = 0;

function generateTaskInstanceId(): string {
  return `wt-${Date.now()}-${++nextTaskInstanceCounter}`;
}

function generateWorkflowRunId(): string {
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── State Machine ──────────────────────────────────────────

/** Valid task status transitions. */
const TASK_TRANSITIONS: Record<WorkflowTaskStatus, readonly WorkflowTaskStatus[]> = {
  pending: ['runnable', 'cancelled'],
  runnable: ['running', 'cancelled'],
  running: ['completed', 'failed', 'waiting', 'cancelled'],
  waiting: ['running', 'cancelled'],
  completed: [], // terminal
  failed: ['cancelled'], // can be cancelled, or retried via new instance
  cancelled: [], // terminal
};

/** Valid workflow run status transitions. */
const RUN_TRANSITIONS: Record<WorkflowRunStatus, readonly WorkflowRunStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [], // terminal
  failed: ['running', 'cancelled'], // retry/resume
  cancelled: [], // terminal
};

function isValidTaskTransition(from: WorkflowTaskStatus, to: WorkflowTaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

function isValidRunTransition(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

// ─── DAG Helpers ────────────────────────────────────────────

/**
 * Check if all dependencies of a task are satisfied.
 * A dependency is satisfied when the referenced task instance is in a terminal state
 * that matches the dependency condition.
 */
function dependenciesSatisfied(
  taskDef: WorkflowTaskDefinition,
  taskInstances: readonly WorkflowTaskInstance[],
): boolean {
  if (taskDef.dependencies.length === 0) return true;

  return taskDef.dependencies.every((depTaskId) => {
    const depInstance = taskInstances.find((t) => t.taskId === depTaskId);
    if (!depInstance) return false; // dependency not yet created

    if (taskDef.dependencyCondition === 'completed') {
      return depInstance.status === 'completed';
    }
    // 'any' terminal state
    return ['completed', 'failed', 'cancelled'].includes(depInstance.status);
  });
}

/**
 * Check if a failed dependency should block dependents.
 * Under 'completed' condition, any non-completed terminal state blocks.
 * Under 'any' condition, only non-terminal states block.
 */
function isDependencyBlocking(
  taskDef: WorkflowTaskDefinition,
  taskInstances: readonly WorkflowTaskInstance[],
): boolean {
  return !dependenciesSatisfied(taskDef, taskInstances);
}

/**
 * Find tasks that should transition to 'runnable'.
 * A task becomes runnable when:
 * 1. Its status is 'pending'
 * 2. All dependencies are satisfied
 */
function findRunnableTasks(plan: WorkflowPlan, taskInstances: readonly WorkflowTaskInstance[]): WorkflowTaskInstance[] {
  const runnable: WorkflowTaskInstance[] = [];

  for (const taskDef of plan.tasks) {
    const instance = taskInstances.find((t) => t.taskId === taskDef.taskId);
    if (!instance) continue;
    if (instance.status !== 'pending') continue;

    if (dependenciesSatisfied(taskDef, taskInstances)) {
      runnable.push(instance);
    }
  }

  return runnable;
}

/**
 * Check if all tasks are in a terminal state.
 */
function allTasksTerminal(tasks: readonly WorkflowTaskInstance[]): boolean {
  return tasks.every((t) => ['completed', 'failed', 'cancelled'].includes(t.status));
}

/**
 * Check if any task failed (not cancelled) — determines workflow failure.
 */
function anyTaskFailed(tasks: readonly WorkflowTaskInstance[]): boolean {
  return tasks.some((t) => t.status === 'failed');
}

/**
 * Validate DAG has no cycles using topological sort.
 */
export function validateDAG(plan: WorkflowPlan): { valid: boolean; error?: string } {
  const taskIds = new Set(plan.tasks.map((t) => t.taskId));

  // Check all dependencies reference existing tasks
  for (const task of plan.tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        return {
          valid: false,
          error: `Task "${task.taskId}" depends on non-existent task "${dep}"`,
        };
      }
    }
  }

  // Cycle detection via topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const task of plan.tasks) {
    inDegree.set(task.taskId, task.dependencies.length);
    adj.set(task.taskId, []);
  }

  for (const task of plan.tasks) {
    for (const dep of task.dependencies) {
      adj.get(dep)?.push(task.taskId);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const neighbor of adj.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (visited !== plan.tasks.length) {
    return { valid: false, error: 'DAG contains a cycle' };
  }

  return { valid: true };
}

// ─── WorkflowRunEngine ──────────────────────────────────────

export class WorkflowRunEngine {
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly runsByIdempotencyKey = new Map<string, WorkflowRun>();
  private readonly plans = new Map<string, WorkflowPlan>();
  private readonly eventCallbacks: WorkflowEventCallback[] = [];

  /** Register an event listener for workflow state transitions (M9 readiness). */
  onEvent(callback: WorkflowEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Start a workflow run. Idempotent: repeated starts for the same
   * idempotencyKey return the same run.
   */
  start(input: WorkflowRunStartInput): WorkflowRunStartResult {
    // Validate DAG
    const dagResult = validateDAG(input.plan);
    if (!dagResult.valid) {
      throw new Error(`M8 DAG INVALID: ${dagResult.error}`);
    }

    // Idempotency: derive key from executionId if not provided
    const idempotencyKey = input.idempotencyKey ?? (input.executionId ? `exec-${input.executionId}` : undefined);

    if (idempotencyKey) {
      const existing = this.runsByIdempotencyKey.get(idempotencyKey);
      if (existing) {
        return {
          run: existing,
          created: false,
          runnableTasks: existing.tasks.filter((t) => t.status === 'runnable'),
        };
      }
    }

    // Create task instances
    const now = new Date().toISOString();
    const tasks: WorkflowTaskInstance[] = input.plan.tasks.map((taskDef) => ({
      taskInstanceId: generateTaskInstanceId() as any,
      taskId: taskDef.taskId,
      workflowRunId: '' as any, // set after run creation
      status: 'pending' as WorkflowTaskStatus,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    }));

    // Create workflow run
    const workflowRunId = generateWorkflowRunId() as any;
    const run: WorkflowRun = {
      workflowRunId,
      planId: input.plan.planId,
      idempotencyKey: idempotencyKey ?? `run-${workflowRunId}`,
      executionId: input.executionId,
      traceId: input.traceId,
      requestId: input.requestId,
      repositoryBindingId: input.repositoryBindingId,
      runtimeSessionBindingId: input.runtimeSessionBindingId,
      status: 'pending',
      tasks,
      createdAt: now,
      updatedAt: now,
    };

    // Update task workflowRunId references
    const updatedTasks = tasks.map((t) => ({ ...t, workflowRunId }));
    const updatedRun = { ...run, tasks: updatedTasks };

    // Store
    this.storeRun(updatedRun);
    this.plans.set(workflowRunId, input.plan);

    // Find initially runnable tasks (no dependencies)
    const runnableTasks = findRunnableTasks(input.plan, updatedTasks);

    // Transition run to running if there are runnable tasks
    let finalRun = updatedRun;
    if (runnableTasks.length > 0) {
      finalRun = this.transitionRun(updatedRun, 'running');
      this.emitEvent('workflow.started', finalRun);

      // Transition runnable tasks to runnable
      const transitionedTasks = finalRun.tasks.map((t) => {
        if (runnableTasks.some((r) => r.taskInstanceId === t.taskInstanceId)) {
          return this.transitionTask(t, 'runnable');
        }
        return t;
      });
      finalRun = { ...finalRun, tasks: transitionedTasks, updatedAt: new Date().toISOString() };
      this.storeRun(finalRun);

      // Emit task.runnable for each task that became runnable
      for (const rt of transitionedTasks.filter((t) => t.status === 'runnable')) {
        this.emitEvent('task.runnable', finalRun, { taskInstanceId: rt.taskInstanceId, taskId: rt.taskId });
      }
    }

    return {
      run: finalRun,
      created: true,
      runnableTasks: finalRun.tasks.filter((t) => t.status === 'runnable'),
    };
  }

  /**
   * Transition a task to running (agent assignment started).
   */
  startTask(
    workflowRunId: WorkflowRunId,
    taskInstanceId: WorkflowTaskId,
    agentAssignmentId: string,
  ): WorkflowTaskInstance {
    const run = this.requireRun(workflowRunId);
    const task = run.tasks.find((t) => t.taskInstanceId === taskInstanceId);
    if (!task) throw new Error(`M8 TASK NOT FOUND: ${taskInstanceId}`);

    if (!isValidTaskTransition(task.status, 'running')) {
      throw new Error(
        `M8 INVALID TRANSITION: Task ${taskInstanceId} cannot transition from "${task.status}" to "running"`,
      );
    }

    const updated = this.transitionTask(task, 'running');
    const updatedTask = { ...updated, agentAssignmentId };

    // Update in run
    const updatedTasks = run.tasks.map((t) => (t.taskInstanceId === taskInstanceId ? updatedTask : t));
    const updatedRun = { ...run, tasks: updatedTasks, updatedAt: new Date().toISOString() };
    this.storeRun(updatedRun);

    this.emitEvent('task.started', updatedRun, {
      taskInstanceId: updatedTask.taskInstanceId,
      taskId: updatedTask.taskId,
      agentAssignmentId,
    });

    return updatedTask;
  }

  /**
   * Complete a task. Handles failure propagation and DAG updates.
   */
  completeTask(input: WorkflowTaskCompleteInput): WorkflowTaskCompleteResult {
    const run = this.requireRun(input.workflowRunId);
    const task = run.tasks.find((t) => t.taskInstanceId === input.taskInstanceId);
    if (!task) throw new Error(`M8 TASK NOT FOUND: ${input.taskInstanceId}`);

    const targetStatus: WorkflowTaskStatus = input.success ? 'completed' : 'failed';
    if (!isValidTaskTransition(task.status, targetStatus)) {
      throw new Error(
        `M8 INVALID TRANSITION: Task ${input.taskInstanceId} cannot transition from "${task.status}" to "${targetStatus}"`,
      );
    }

    // Transition task
    let updatedTask = this.transitionTask(task, targetStatus);
    if (input.success) {
      updatedTask = { ...updatedTask, output: input.output };
    } else {
      updatedTask = { ...updatedTask, error: input.error };
    }

    // Update in run
    let updatedTasks = run.tasks.map((t) => (t.taskInstanceId === input.taskInstanceId ? updatedTask : t));

    // Failure propagation: if task failed under 'completed' dependency condition,
    // dependent tasks remain pending (they cannot become runnable)
    // This is already handled by dependenciesSatisfied checking status.

    // Find newly runnable tasks
    const plan = this.getPlan(run);
    const runnableTasks = plan ? findRunnableTasks(plan, updatedTasks) : [];

    // Transition runnable tasks
    const newlyRunnable: WorkflowTaskInstance[] = [];
    for (const rt of runnableTasks) {
      const updated = this.transitionTask(rt, 'runnable');
      updatedTasks = updatedTasks.map((t) => (t.taskInstanceId === rt.taskInstanceId ? updated : t));
      newlyRunnable.push(updated);
    }

    // Check workflow terminal state
    const updatedRun = { ...run, tasks: updatedTasks, updatedAt: new Date().toISOString() };
    let finalRun = updatedRun;

    // Only transition workflow if it is not already terminal
    const alreadyTerminal = ['completed', 'failed', 'cancelled'].includes(run.status);
    if (!alreadyTerminal) {
      if (allTasksTerminal(updatedTasks)) {
        if (anyTaskFailed(updatedTasks)) {
          finalRun = this.transitionRun(updatedRun, 'failed');
        } else {
          finalRun = this.transitionRun(updatedRun, 'completed');
        }
      } else if (plan && this.isDeadlocked(plan, updatedTasks)) {
        // Deadlock: no tasks can become runnable and not all tasks are terminal.
        // This happens when a failed task blocks all remaining dependents.
        finalRun = this.transitionRun(updatedRun, 'failed');
      }
    }

    this.storeRun(finalRun);

    // Emit task.completed/task.failed
    this.emitEvent(input.success ? 'task.completed' : 'task.failed', finalRun, {
      taskInstanceId: updatedTask.taskInstanceId,
      taskId: updatedTask.taskId,
      ...(input.success ? { output: input.output } : { error: input.error }),
    });

    // Emit task.runnable for newly released tasks
    for (const rt of newlyRunnable) {
      this.emitEvent('task.runnable', finalRun, { taskInstanceId: rt.taskInstanceId, taskId: rt.taskId });
    }

    // Emit workflow terminal events
    if (finalRun.status !== run.status) {
      if (finalRun.status === 'completed') this.emitEvent('workflow.completed', finalRun);
      else if (finalRun.status === 'failed') this.emitEvent('workflow.failed', finalRun);
    }

    return {
      task: updatedTask,
      run: finalRun,
      newlyRunnable,
      workflowTerminal: ['completed', 'failed', 'cancelled'].includes(finalRun.status),
    };
  }

  /**
   * Cancel a workflow run. All non-terminal tasks become cancelled.
   */
  cancelRun(workflowRunId: WorkflowRunId): WorkflowRun {
    const run = this.requireRun(workflowRunId);

    const updatedTasks = run.tasks.map((t) => {
      if (['completed', 'cancelled'].includes(t.status)) return t;
      return this.transitionTask(t, 'cancelled');
    });

    const updatedRun = { ...run, tasks: updatedTasks, updatedAt: new Date().toISOString() };
    const finalRun = this.transitionRun(updatedRun, 'cancelled');
    this.storeRun(finalRun);

    this.emitEvent('workflow.cancelled', finalRun);

    // Emit task.cancelled for each task that was cancelled
    for (const t of updatedTasks) {
      if (t.status === 'cancelled') {
        this.emitEvent('task.cancelled', finalRun, { taskInstanceId: t.taskInstanceId, taskId: t.taskId });
      }
    }

    return finalRun;
  }

  /**
   * Get a workflow run by ID.
   */
  getRun(workflowRunId: WorkflowRunId): WorkflowRun | undefined {
    return this.runs.get(workflowRunId);
  }

  /**
   * List all workflow runs.
   */
  listRuns(): WorkflowRun[] {
    return [...this.runs.values()];
  }

  // ─── Private Helpers ──────────────────────────────────────

  private emitEvent(type: WorkflowEventType, run: WorkflowRun, extra?: Partial<WorkflowEvent>): void {
    const event: WorkflowEvent = {
      type,
      workflowRunId: run.workflowRunId,
      executionId: run.executionId,
      traceId: run.traceId,
      requestId: run.requestId as any,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }

  /** Store run in both maps to prevent idempotency key staleness. */
  private storeRun(run: WorkflowRun): void {
    this.runs.set(run.workflowRunId, run);
    if (run.idempotencyKey) {
      this.runsByIdempotencyKey.set(run.idempotencyKey, run);
    }
  }

  private requireRun(workflowRunId: WorkflowRunId): WorkflowRun {
    const run = this.runs.get(workflowRunId);
    if (!run) throw new Error(`M8 WORKFLOW RUN NOT FOUND: ${workflowRunId}`);
    return run;
  }

  private getPlan(run: WorkflowRun): WorkflowPlan | undefined {
    return this.plans.get(run.workflowRunId);
  }

  private transitionTask(task: WorkflowTaskInstance, to: WorkflowTaskStatus): WorkflowTaskInstance {
    if (!isValidTaskTransition(task.status, to)) {
      throw new Error(
        `M8 INVALID TRANSITION: Task ${task.taskInstanceId} cannot transition from "${task.status}" to "${to}"`,
      );
    }

    const now = new Date().toISOString();
    const updated: WorkflowTaskInstance = {
      ...task,
      status: to,
      updatedAt: now,
    };

    if (to === 'running') {
      return { ...updated, startedAt: now };
    }
    if (['completed', 'failed', 'cancelled'].includes(to)) {
      return { ...updated, completedAt: now, terminalState: to as 'completed' | 'failed' | 'cancelled' };
    }

    return updated;
  }

  private transitionRun(run: WorkflowRun, to: WorkflowRunStatus): WorkflowRun {
    if (!isValidRunTransition(run.status, to)) {
      throw new Error(
        `M8 INVALID TRANSITION: WorkflowRun ${run.workflowRunId} cannot transition from "${run.status}" to "${to}"`,
      );
    }

    const now = new Date().toISOString();
    const updated: WorkflowRun = {
      ...run,
      status: to,
      updatedAt: now,
    };

    if (to === 'running' && !updated.startedAt) {
      return { ...updated, startedAt: now };
    }
    if (['completed', 'failed', 'cancelled'].includes(to)) {
      return { ...updated, completedAt: now };
    }

    return updated;
  }

  /**
   * Detect deadlock: no pending tasks can become runnable, AND no tasks are
   * currently runnable or running. This means no future progress is possible.
   * This happens when a failed task blocks all remaining dependents under
   * 'completed' dependency condition and no active work remains.
   */
  private isDeadlocked(plan: WorkflowPlan, tasks: readonly WorkflowTaskInstance[]): boolean {
    const pendingTasks = tasks.filter((t) => t.status === 'pending');
    if (pendingTasks.length === 0) return false; // all terminal, handled by allTasksTerminal

    // If any task is runnable or running, progress is still possible
    const activeTasks = tasks.filter((t) => t.status === 'runnable' || t.status === 'running');
    if (activeTasks.length > 0) return false;

    // No active work and pending tasks exist — check if any can become runnable
    const anyRunnable = findRunnableTasks(plan, tasks);
    return anyRunnable.length === 0;
  }
}
