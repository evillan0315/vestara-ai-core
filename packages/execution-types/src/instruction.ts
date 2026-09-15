/**
 * Instruction layering contract (AR-GA-CORE-005 §5–§6).
 *
 * Two layers, separately owned and versioned — formalized where the owners
 * already exist, never as a parallel prompt subsystem:
 *
 *   RoleInstruction — persistent role/session behavior and governance.
 *     Source of truth: `packages/workspace/src/agents.registry.ts` +
 *     `.opencode/agents/vestara-*.md`. This contract carries a REFERENCE
 *     (agent id + role), never prompt text. No duplicate role-prompt store.
 *
 *   TaskInstruction / TaskEnvelope — bounded per-turn delta for one execution.
 *     Owner: the workflow milestone line (`WorkflowTask` in
 *     `@vestara/workflow-orchestrator`, dispatched through this package's
 *     `RuntimeExecutionPort`). Transmitted per execution; discarded at task
 *     terminal state. The same envelope serves Developer, Reviewer, Planner
 *     and future specialists with no role-specific forks; roles specialize
 *     only the expected-result kind.
 *
 * Preserved separations:
 *   RoleInstruction ≠ TaskInstruction (persistent behavior vs per-turn delta).
 *   TaskInstruction ≠ full conversation context (delta only; history, transcripts,
 *     and architecture text are never re-injected by this contract).
 *   Instruction ≠ Authority (an envelope authorizes nothing by itself; execution
 *     authority flows only through permission-contracts PolicyDecision and
 *     milestone authorization).
 *   Context retrieval ≠ repeated context injection (persistent sessions receive
 *     the RoleInstruction reference once at bind/resume; subsequent turns carry
 *     only the new TaskInstruction delta).
 */

import type { ExecutionId, RuntimeSessionId, WorkflowRunId, WorkflowTaskId } from './identity.js';

/**
 * Turn-routing mode: who selected the role for this turn
 * (AR-GA-CORE-005 §2). Recorded as attribution, never as authorization.
 */
export type TurnRoutingMode = 'direct' | 'coordinated' | 'inferred';

/** Closed vocabulary — how a turn's role was selected. */
export const TURN_ROUTING_MODES: readonly TurnRoutingMode[] = ['direct', 'coordinated', 'inferred'];

/**
 * Reference to a persistent RoleInstruction.
 *
 * Resolves against `agents.registry.ts` (single source of truth) and its
 * `.opencode/agents/` mirrors. Carries identity only — embedding role prompt
 * text here is non-conformant (it would fork the registry).
 */
export interface RoleInstructionRef {
  /** Registry agent id (e.g. 'agent-developer', 'agent-reviewer'). */
  readonly agentId: string;
  /** Registry role (e.g. 'developer', 'reviewer'). */
  readonly role: string;
  /** Optional registry pin; absent means current registry truth. */
  readonly registryVersion?: string;
}

/**
 * Authorized scope delta for one execution.
 */
export interface TaskScope {
  /** Bounded task summary (one turn's work, not the whole plan). */
  readonly summary: string;
  /** Files the turn may touch (empty = none declared). */
  readonly files?: readonly string[];
  /** Owning plan, when orchestrated. */
  readonly planId?: string;
}

/**
 * Required verification/evidence for the turn's result to be consumable.
 */
export interface VerificationRequirement {
  /** Evidence that must accompany the result (kinds or refs). */
  readonly evidence: readonly string[];
  /** Acceptance checks the result must satisfy. */
  readonly acceptance: readonly string[];
}

/**
 * Expected structured result. Same shape for every role; roles specialize
 * only `kind` by convention (Reviewer: findings/verdicts; Developer:
 * implementation/evidence; Planner: plan-proposal) without contract forks.
 */
export interface ExpectedResult {
  /** Result kind (role convention, e.g. 'findings-verdicts'). */
  readonly kind: string;
  /** What the consumer must be able to establish from the result. */
  readonly description: string;
}

/**
 * Bounded per-turn instruction delta.
 */
export interface TaskInstruction {
  /** Task identity (`WorkflowTask.id`). */
  readonly taskId: string;
  /** Task revision pinned at dispatch (`WorkflowTask.revisionCount`). */
  readonly taskRevision: number;
  /** Milestone/delta identity (e.g. 'CI-OBS-001D'). */
  readonly milestoneId?: string;
  /** Who selected the role for this turn (attribution only). */
  readonly mode: TurnRoutingMode;
  /** Authorized scope delta — nothing outside it is in scope. */
  readonly scope: TaskScope;
  /** Frozen boundaries/contracts this turn must respect (doc/contract refs). */
  readonly boundaries: readonly string[];
  /** Invariants this turn must preserve. */
  readonly invariants: readonly string[];
  /** Verification/evidence the result must carry. */
  readonly verification: VerificationRequirement;
  /** Expected structured result/verdict. */
  readonly expectedResult: ExpectedResult;
  /** HOLD conditions: states that must stop the turn without override. */
  readonly holdConditions: readonly string[];
  /** Explicit STOP condition completing the turn. */
  readonly stop: string;
}

/**
 * Dispatch envelope: persistent role reference + per-turn delta.
 *
 * Persistent-session dispatch reuses the SAME `roleInstruction` reference
 * across turns and transmits ONLY a new `instruction` delta. Session,
 * execution, and workflow correlation ride alongside for binding continuity
 * (CORE-006); they grant no authority.
 */
export interface TaskEnvelope {
  /** Persistent role reference (stable across turns of a session). */
  readonly roleInstruction: RoleInstructionRef;
  /** This turn's bounded delta (fresh per turn). */
  readonly instruction: TaskInstruction;
  /** Correlated execution, when dispatched through the port. */
  readonly executionId?: ExecutionId;
  /** Persistent runtime session reused across turns. */
  readonly runtimeSessionId?: RuntimeSessionId;
  /** Correlated workflow run, when orchestrated. */
  readonly workflowRunId?: WorkflowRunId;
  /** Correlated workflow task, when orchestrated. */
  readonly workflowTaskId?: WorkflowTaskId;
}

/**
 * True when the envelope carries only references and delta content —
 * no prompt text, transcripts, history, or architecture re-injection.
 * Structural guard for the layering contract (used by conformance tests
 * and dispatch validation).
 */
export function isDeltaOnlyEnvelope(envelope: TaskEnvelope): boolean {
  const roleKeys = Object.keys(envelope.roleInstruction).sort();
  const roleOk =
    roleKeys.length >= 2 && roleKeys.every((key) => key === 'agentId' || key === 'role' || key === 'registryVersion');
  const topKeys = Object.keys(envelope);
  const topOk = topKeys.every((key) =>
    ['roleInstruction', 'instruction', 'executionId', 'runtimeSessionId', 'workflowRunId', 'workflowTaskId'].includes(
      key,
    ),
  );
  return roleOk && topOk;
}
