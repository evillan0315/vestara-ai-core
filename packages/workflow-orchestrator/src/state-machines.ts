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
  'in-progress': ['needs-review', 'testing', 'completed', 'failed', 'cancelled'],
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

export function createTaskMachine(initial: TaskStatus = 'pending'): StateMachine<TaskStatus, TaskStatus> {
  return createStateMachine({ initial, states: TASK_TRANSITIONS });
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}
