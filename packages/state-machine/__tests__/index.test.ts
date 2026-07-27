import { describe, expect, it } from 'vitest';

type TaskState = 'pending' | 'active' | 'completed' | 'failed' | 'archived';

const taskMachineConfig = {
  initial: 'pending' as TaskState,
  states: {
    pending: ['active'] as TaskState[],
    active: ['completed', 'failed'] as TaskState[],
    completed: ['archived'] as TaskState[],
    failed: ['archived'] as TaskState[],
    archived: [] as TaskState[],
  },
};

describe('@vestara/state-machine', () => {
  it('creates a machine in the initial state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(machine.state).toBe('pending');
  });

  it('transitions to a valid next state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    expect(machine.state).toBe('active');
  });

  it('throws on invalid transition', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(() => machine.transition('completed')).toThrow(
      'Invalid transition: "pending" cannot transition to "completed"',
    );
  });

  it('throws on transition from terminal state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    machine.transition('completed');
    expect(() => machine.transition('pending')).toThrow(
      'Invalid transition: "completed" cannot transition to "pending"',
    );
  });

  it('canTransition returns true for valid target', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(machine.canTransition('active')).toBe(true);
  });

  it('canTransition returns false for invalid target', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(machine.canTransition('completed')).toBe(false);
  });

  it('canTransition returns false from terminal state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    machine.transition('completed');
    machine.transition('archived');
    expect(machine.canTransition('pending')).toBe(false);
    expect(machine.canTransition('active')).toBe(false);
    expect(machine.canTransition('completed')).toBe(false);
    expect(machine.canTransition('failed')).toBe(false);
  });

  it('subscribe receives transition notifications', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    const transitions: Array<{ from: string; to: string }> = [];
    machine.subscribe((t: { from: string; to: string }) => {
      transitions.push({ from: t.from, to: t.to });
    });
    machine.transition('active');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].from).toBe('pending');
    expect(transitions[0].to).toBe('active');
  });

  it('subscribe returns unsubscribe function', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    const transitions: string[] = [];
    const unsubscribe = machine.subscribe(() => {
      transitions.push('fired');
    });
    machine.transition('active');
    expect(transitions).toHaveLength(1);
    unsubscribe();
    machine.transition('completed');
    expect(transitions).toHaveLength(1);
  });

  it('history records all transitions', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(machine.history()).toHaveLength(0);
    machine.transition('active');
    expect(machine.history()).toHaveLength(1);
    machine.transition('completed');
    expect(machine.history()).toHaveLength(2);
  });

  it('history captures transition details', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    const entry = machine.history()[0];
    expect(entry.from).toBe('pending');
    expect(entry.to).toBe('active');
    expect(entry.event).toBe('active');
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.timestamp.length).toBeGreaterThan(0);
  });

  it('history is immutable (returned as readonly)', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    const history = machine.history();
    expect(Array.isArray(history)).toBe(true);
    history.push = undefined as unknown as never;
    expect(machine.history()).toHaveLength(1);
  });

  it('reset restores initial state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    machine.transition('completed');
    expect(machine.state).toBe('completed');
    machine.reset();
    expect(machine.state).toBe('pending');
  });

  it('reset clears history', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    expect(machine.history()).toHaveLength(1);
    machine.reset();
    expect(machine.history()).toHaveLength(0);
  });

  it('reset enables fresh transitions from initial state', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    machine.transition('completed');
    machine.reset();
    expect(machine.state).toBe('pending');
    machine.transition('active');
    expect(machine.state).toBe('active');
  });

  it('chaining works (returns this)', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    const result = machine.transition('active');
    expect(result).toBe(machine);
  });

  it('works with single-state machine', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine({
      initial: 'terminal',
      states: { terminal: [] },
    });
    expect(machine.state).toBe('terminal');
    expect(machine.canTransition('anything')).toBe(false);
  });

  it('throws on creation with invalid initial state', () => {
    const mod = require('../dist/index.js');
    expect(() =>
      mod.createStateMachine({
        initial: 'nonexistent',
        states: { valid: ['state'] },
      }),
    ).toThrow('Invalid config: initial state "nonexistent" not found in states');
  });

  it('transition timestamp reflects transition time', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    const before = new Date().toISOString();
    machine.transition('active');
    const after = new Date().toISOString();
    const entry = machine.history()[0];
    expect(entry.timestamp >= before || entry.timestamp <= after).toBe(true);
  });

  it('supports multiple subscribers', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    let count1 = 0;
    let count2 = 0;
    machine.subscribe(() => {
      count1++;
    });
    machine.subscribe(() => {
      count2++;
    });
    machine.transition('active');
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it('error message lists valid targets on invalid transition', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(() => machine.transition('archived')).toThrow('Valid targets: ["active"]');
  });

  it('handles full lifecycle correctly', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    expect(machine.state).toBe('pending');
    machine.transition('active');
    expect(machine.state).toBe('active');
    machine.transition('completed');
    expect(machine.state).toBe('completed');
    machine.transition('archived');
    expect(machine.state).toBe('archived');
    expect(machine.history()).toHaveLength(3);
  });

  it('handles failure path correctly', () => {
    const mod = require('../dist/index.js');
    const machine = mod.createStateMachine(taskMachineConfig);
    machine.transition('active');
    machine.transition('failed');
    expect(machine.state).toBe('failed');
    machine.transition('archived');
    expect(machine.state).toBe('archived');
    expect(machine.history()).toHaveLength(3);
  });
});
