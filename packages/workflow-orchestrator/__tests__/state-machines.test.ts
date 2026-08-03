import { describe, expect, it } from 'vitest';
import {
  canTransitionPlan,
  canTransitionProject,
  canTransitionTask,
  createPlanMachine,
  createProjectMachine,
  createTaskMachine,
} from '../src/state-machines';

describe('project state machine (PCS-025 §7.1)', () => {
  it('walks the canonical lifecycle', () => {
    const machine = createProjectMachine();
    expect(machine.state).toBe('draft');
    machine.transition('analyzing');
    machine.transition('planning');
    machine.transition('architecture');
    machine.transition('pending-approval');
    machine.transition('executing');
    machine.transition('verifying');
    machine.transition('completed');
    machine.transition('archived');
    expect(machine.state).toBe('archived');
  });

  it('allows cancellation from any non-terminal phase', () => {
    for (const phase of [
      'draft',
      'analyzing',
      'planning',
      'architecture',
      'pending-approval',
      'executing',
      'verifying',
    ]) {
      expect(canTransitionProject(phase, 'cancelled')).toBe(true);
    }
    expect(canTransitionProject('completed', 'cancelled')).toBe(false);
    expect(canTransitionProject('archived', 'cancelled')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionProject('draft', 'executing')).toBe(false);
    expect(canTransitionProject('archived', 'verifying')).toBe(false);
    expect(() => createProjectMachine().transition('completed')).toThrow(/Invalid transition/);
  });

  it('verifier failure reopens executing (bounded)', () => {
    expect(canTransitionProject('verifying', 'executing')).toBe(true);
    expect(canTransitionProject('verifying', 'testing')).toBe(false);
  });
});

describe('plan state machine (PCS-025 §7.2)', () => {
  it('walks draft → proposed → reviewed → approved → executing → completed', () => {
    const machine = createPlanMachine();
    machine.transition('proposed');
    machine.transition('reviewed');
    machine.transition('approved');
    machine.transition('executing');
    machine.transition('completed');
    expect(machine.state).toBe('completed');
  });

  it('supports revision loops', () => {
    expect(canTransitionPlan('reviewed', 'needs-revision')).toBe(true);
    expect(canTransitionPlan('needs-revision', 'proposed')).toBe(true);
    expect(canTransitionPlan('proposed', 'reviewed')).toBe(true);
  });
});

describe('task state machine (PCS-025 §5)', () => {
  it('walks pending → ready → assigned → in-progress → completed', () => {
    const machine = createTaskMachine();
    machine.transition('ready');
    machine.transition('assigned');
    machine.transition('in-progress');
    machine.transition('completed');
    expect(machine.state).toBe('completed');
  });

  it('supports the failure → retrying → assigned loop', () => {
    const machine = createTaskMachine();
    machine.transition('ready');
    machine.transition('assigned');
    machine.transition('in-progress');
    machine.transition('failed');
    machine.transition('retrying');
    machine.transition('assigned');
    expect(machine.state).toBe('assigned');
  });

  it('blocks after review rejection / lock conflict', () => {
    expect(canTransitionTask('reviewing', 'blocked')).toBe(true);
    expect(canTransitionTask('ready', 'blocked')).toBe(true);
    expect(canTransitionTask('in-progress', 'completed')).toBe(true);
  });

  it('rejects terminal re-entry and illegal jumps', () => {
    expect(canTransitionTask('completed', 'assigned')).toBe(false);
    expect(canTransitionTask('pending', 'completed')).toBe(false);
  });
});
