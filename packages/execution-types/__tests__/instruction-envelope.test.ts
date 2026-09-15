/**
 * Instruction layering conformance (AR-GA-CORE-005 §5–§6).
 *
 * Verifies the RoleInstruction/TaskInstruction split structurally:
 * persistent-session dispatch reuses the RoleInstruction reference while
 * transmitting only the new TaskInstruction delta — no prompt text,
 * transcripts, history, or architecture re-injection, and no role-specific
 * contract forks across Developer/Reviewer/Planner.
 */
import { describe, expect, it } from 'vitest';
import type { RoleInstructionRef, TaskEnvelope, TaskInstruction } from '../../execution-types/src/index.js';
import { isDeltaOnlyEnvelope } from '../../execution-types/src/index.js';

const REVIEWER_ROLE: RoleInstructionRef = { agentId: 'agent-reviewer', role: 'reviewer' };
const DEVELOPER_ROLE: RoleInstructionRef = { agentId: 'agent-developer', role: 'developer' };

function instruction(taskId: string, summary: string): TaskInstruction {
  return {
    taskId,
    taskRevision: 1,
    milestoneId: 'CI-OBS-001D',
    mode: 'coordinated',
    scope: { summary },
    boundaries: ['docs/ci-obs-001d-001-reviewer-decision-contract.md'],
    invariants: ['Failure ≠ Root Cause', 'Claim ≠ Evidence'],
    verification: { evidence: ['evidenceRefs'], acceptance: ['T-table conformance'] },
    expectedResult: { kind: 'findings-verdicts', description: 'ReviewerDecision record' },
    holdConditions: ['frozen contract change required'],
    stop: 'Decision emitted and validated; no mutation performed.',
  };
}

describe('RoleInstruction reference (no duplicate prompt store)', () => {
  it('carries identity only — exact key set, no text fields', () => {
    expect(Object.keys(REVIEWER_ROLE).sort()).toEqual(['agentId', 'role']);
    expect(JSON.stringify(REVIEWER_ROLE)).not.toMatch(/prompt/i);
  });
});

describe('persistent-session dispatch sends delta only', () => {
  it('reuses the RoleInstruction reference across turns with a fresh delta', () => {
    const session = 'rs-7' as never;
    const turn1: TaskEnvelope = {
      roleInstruction: REVIEWER_ROLE,
      instruction: instruction('task-a', 'Classify evidence batch one.'),
      runtimeSessionId: session,
    };
    const turn2: TaskEnvelope = {
      roleInstruction: REVIEWER_ROLE,
      instruction: instruction('task-b', 'Classify evidence batch two.'),
      runtimeSessionId: session,
    };
    // Same role reference reused — not re-transmitted content.
    expect(turn2.roleInstruction).toEqual(turn1.roleInstruction);
    // Only the delta changed.
    expect(turn2.instruction.taskId).not.toBe(turn1.instruction.taskId);
    expect(JSON.stringify(turn2)).not.toContain('batch one');
    // Both envelopes satisfy the structural delta-only guard.
    expect(isDeltaOnlyEnvelope(turn1)).toBe(true);
    expect(isDeltaOnlyEnvelope(turn2)).toBe(true);
  });
});

describe('one envelope for every role (no forks)', () => {
  it('serves Reviewer and Developer through the same TaskEnvelope shape', () => {
    const reviewer: TaskEnvelope = { roleInstruction: REVIEWER_ROLE, instruction: instruction('task-r', 'Review.') };
    const developer: TaskEnvelope = {
      roleInstruction: DEVELOPER_ROLE,
      instruction: {
        ...instruction('task-d', 'Implement.'),
        expectedResult: { kind: 'implementation-evidence', description: 'Diff plus test evidence' },
      },
    };
    expect(isDeltaOnlyEnvelope(reviewer)).toBe(true);
    expect(isDeltaOnlyEnvelope(developer)).toBe(true);
    expect(reviewer.instruction.stop.length).toBeGreaterThan(0);
    expect(developer.instruction.holdConditions.length).toBeGreaterThan(0);
  });
});

describe('STOP/HOLD presence', () => {
  it('every instruction carries an explicit STOP and HOLD set', () => {
    const envelope: TaskEnvelope = { roleInstruction: REVIEWER_ROLE, instruction: instruction('task-a', 'Review.') };
    expect(envelope.instruction.stop.length).toBeGreaterThan(0);
    expect(Array.isArray(envelope.instruction.holdConditions)).toBe(true);
  });
});
