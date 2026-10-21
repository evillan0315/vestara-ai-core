/**
 * Project / Plan / Task state machines built on @vestara/state-machine.
 *
 * Transition tables mirror PCS-025 §7 (7.1 Project, 7.2 Plan) and §5 (Task).
 * The orchestrator is the single writer: it validates every transition before
 * persisting, then appends an audit event.
 */

import { createStateMachine, type StateMachine } from '@vestara/state-machine';
import type { PlanStatus, ProjectPhase, TaskStatus } from './types';

// ─── Project (PCS-025 §7.1) ───────────────────────────────────

export const PROJECT_TRANSITIONS: Record<ProjectPhase, readonly ProjectPhase[]> = {
  draft: ['analyzing', 'cancelled'],
  analyzing: ['planning', 'cancelled'],
  planning: ['architecture', 'cancelled'],
  architecture: ['planning', 'pending-approval', 'cancelled'],
  'pending-approval': ['executing', 'cancelled'],
  executing: ['verifying', 'cancelled'],
  verifying: ['executing', 'completed', 'cancelled'],
  completed: ['archived'],
  archived: [],
  cancelled: [],
};

export function createProjectMachine(initial: ProjectPhase = 'draft'): StateMachine<ProjectPhase, ProjectPhase> {
  return createStateMachine({ initial, states: PROJECT_TRANSITIONS });
}

export function canTransitionProject(from: ProjectPhase, to: ProjectPhase): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

// ─── Plan (PCS-025 §7.2) ──────────────────────────────────────

export const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  draft: ['proposed', 'cancelled'],
  proposed: ['reviewed', 'needs-revision', 'cancelled'],
  reviewed: ['approved', 'needs-revision', 'cancelled'],
  approved: ['executing', 'cancelled'],
  executing: ['completed', 'needs-revision', 'cancelled'],
  completed: [],
  cancelled: [],
  'needs-revision': ['proposed', 'cancelled'],
};

export function createPlanMachine(initial: PlanStatus = 'draft'): StateMachine<PlanStatus, PlanStatus> {
  return createStateMachine({ initial, states: PLAN_TRANSITIONS });
}

export function canTransitionPlan(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_TRANSITIONS[from].includes(to);
}

// ─── Task (PCS-025 §5) ────────────────────────────────────────

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['ready', 'cancelled'],
  ready: ['assigned', 'awaiting-approval', 'blocked', 'cancelled'],
  'awaiting-approval': ['ready', 'assigned', 'blocked', 'cancelled'],
  assigned: ['in-progress', 'failed', 'cancelled'],
  // `assigned` is the operator recovery path (see RECOVERABLE_TASK_STATUSES):
  // a dispatch that died with the process leaves the task `in-progress`, and
  // only the governed requeue may put it back in the dispatch queue.
  'in-progress': ['awaiting-verification', 'needs-review', 'testing', 'completed', 'failed', 'cancelled', 'assigned'],
  'awaiting-verification': ['in-progress', 'failed', 'cancelled'],
  'needs-review': ['reviewing', 'cancelled'],
  reviewing: ['approved', 'changes-requested', 'blocked', 'cancelled'],
  'changes-requested': ['assigned', 'blocked', 'cancelled'],
  testing: ['approved', 'failed', 'cancelled'],
  approved: ['testing', 'completed', 'cancelled'],
  retrying: ['assigned', 'failed', 'cancelled'],
  blocked: ['assigned', 'cancelled'],
  failed: ['retrying', 'blocked', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Task states the governed operator requeue path may recover.
 *
 * - `blocked` / `failed` — the task ran and did not complete.
 * - `retrying` — the process died between the failed attempt and its retry.
 * - `in-progress` — the dispatch died mid-flight (crash, restart, or a hung
 *   agent turn). `runExecution` only dispatches `pending` / `ready` /
 *   `assigned` tasks, so a task left in these two states is unreachable for
 *   the automatic loop and wedges the project — it also keeps the file locks
 *   it acquired, which blocks every dependent task.
 */
export const RECOVERABLE_TASK_STATUSES: readonly TaskStatus[] = ['blocked', 'failed', 'retrying', 'in-progress'];

export function isRecoverableTaskStatus(status: TaskStatus): boolean {
  return RECOVERABLE_TASK_STATUSES.includes(status);
}

export function createTaskMachine(initial: TaskStatus = 'pending'): StateMachine<TaskStatus, TaskStatus> {
  return createStateMachine({ initial, states: TASK_TRANSITIONS });
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}
