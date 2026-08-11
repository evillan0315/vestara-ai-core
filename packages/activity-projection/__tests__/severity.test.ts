import type {
  AgentMessageActivity,
  TaskActivity,
  TestActivity,
  VerificationActivity,
  WorkflowActivity,
} from '@vestara/activity-projection';
import { severityOf } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { workflowRecord } from './helpers';

const base = {
  id: 'activity:1',
  sequence: 1,
  timestamp: '2026-08-06T12:00:00.000Z',
  actor: { type: 'system', id: 'system', displayName: 'system', role: 'system' },
  evidenceRefs: [] as readonly string[],
};

function workflow(overrides: Partial<WorkflowActivity>): WorkflowActivity {
  return {
    ...base,
    kind: 'workflow' as const,
    workflowId: 'wfo-1',
    previousState: 'draft',
    currentState: 'executing',
    reason: 'phase changed',
    authoritative: true,
    observed: false,
    ...overrides,
  };
}

function task(overrides: Partial<TaskActivity>): TaskActivity {
  return {
    ...base,
    kind: 'task' as const,
    taskId: 'task-1',
    previousStatus: 'pending',
    status: 'ready',
    ...overrides,
  };
}

function message(overrides: Partial<AgentMessageActivity>): AgentMessageActivity {
  return {
    ...base,
    kind: 'agent-message' as const,
    agentId: 'engineer',
    messageKind: 'message',
    content: 'hello',
    ...overrides,
  };
}

function test(overrides: Partial<TestActivity>): TestActivity {
  return {
    ...base,
    kind: 'test' as const,
    command: 'tests',
    passed: 0,
    failed: 0,
    skipped: 0,
    failureFingerprints: [],
    ...overrides,
  };
}

function verification(overrides: Partial<VerificationActivity>): VerificationActivity {
  return {
    ...base,
    kind: 'verification' as const,
    outcome: 'passed',
    checks: [],
    ...overrides,
  };
}

describe('severityOf', () => {
  it('derives workflow severity from the current state', () => {
    expect(severityOf(workflow({ currentState: 'completed' }))).toBe('success');
    expect(severityOf(workflow({ currentState: 'approved' }))).toBe('success');
    expect(severityOf(workflow({ currentState: 'cancelled' }))).toBe('warning');
    expect(severityOf(workflow({ currentState: 'executing' }))).toBe('info');
  });

  it('derives task severity from the task status', () => {
    expect(severityOf(task({ status: 'completed' }))).toBe('success');
    expect(severityOf(task({ status: 'failed' }))).toBe('error');
    expect(severityOf(task({ status: 'blocked' }))).toBe('warning');
    expect(severityOf(task({ status: 'cancelled' }))).toBe('warning');
    expect(severityOf(task({ status: 'in-progress' }))).toBe('info');
  });

  it('derives agent-message severity from failures, approvals, and risk', () => {
    expect(severityOf(message({ messageKind: 'tool-result', status: 'failed' }))).toBe('error');
    expect(severityOf(message({ messageKind: 'approval-request' }))).toBe('warning');
    expect(severityOf(message({ messageKind: 'tool-call', risk: 'critical' }))).toBe('warning');
    expect(severityOf(message({ messageKind: 'message', content: 'ok' }))).toBe('info');
  });

  it('derives test severity from pass/fail counts', () => {
    expect(severityOf(test({ failed: 2, passed: 3 }))).toBe('error');
    expect(severityOf(test({ failed: 0, passed: 3 }))).toBe('success');
    expect(severityOf(test({ failed: 0, passed: 0 }))).toBe('info');
  });

  it('derives verification severity from the outcome', () => {
    expect(severityOf(verification({ outcome: 'passed' }))).toBe('success');
    expect(severityOf(verification({ outcome: 'failed' }))).toBe('error');
    expect(severityOf(verification({ outcome: 'blocked' }))).toBe('warning');
    expect(severityOf(verification({ outcome: 'inconclusive' }))).toBe('info');
  });

  it('is compatible with the stored workflow records', () => {
    expect(severityOf(workflowRecord({ id: 'a', sequence: 1, currentState: 'completed' }))).toBe('success');
  });
});
