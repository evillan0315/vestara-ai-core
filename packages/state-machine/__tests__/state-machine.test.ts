import { describe, expect, it, vi } from 'vitest';
import { createStateMachine } from '../src/index';

describe('createStateMachine', () => {
  const config = {
    initial: 'idle' as const,
    states: {
      idle: ['running', 'stopped'],
      running: ['paused', 'stopped'],
      paused: ['running', 'stopped'],
      stopped: [],
    },
  };

  it('starts in the initial state', () => {
    const sm = createStateMachine(config);
    expect(sm.state).toBe('idle');
  });

  it('transitions to a valid target state', () => {
    const sm = createStateMachine(config);
    sm.transition('running');
    expect(sm.state).toBe('running');
  });

  it('throws on invalid transition', () => {
    const sm = createStateMachine(config);
    expect(() => sm.transition('paused' as never)).toThrow('Invalid transition');
  });

  it('throws when initial state is not in states', () => {
    expect(() =>
      createStateMachine({
        initial: 'nonexistent' as never,
        states: { idle: ['running'] },
      }),
    ).toThrow('Invalid config');
  });

  it('canTransition returns true for valid targets', () => {
    const sm = createStateMachine(config);
    expect(sm.canTransition('running')).toBe(true);
  });

  it('canTransition returns false for invalid targets', () => {
    const sm = createStateMachine(config);
    expect(sm.canTransition('paused' as never)).toBe(false);
  });

  it('notifies listeners on transition', () => {
    const sm = createStateMachine(config);
    const listener = vi.fn();

    sm.subscribe(listener);
    sm.transition('running');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ from: 'idle', to: 'running' }));
  });

  it('unsubscribe stops listener notifications', () => {
    const sm = createStateMachine(config);
    const listener = vi.fn();

    const unsub = sm.subscribe(listener);
    unsub();
    sm.transition('running');

    expect(listener).not.toHaveBeenCalled();
  });

  it('records transition history', () => {
    const sm = createStateMachine(config);
    sm.transition('running');
    sm.transition('paused');

    const history = sm.history();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ from: 'idle', to: 'running' });
    expect(history[1]).toMatchObject({ from: 'running', to: 'paused' });
  });

  it('reset returns to initial state and clears history', () => {
    const sm = createStateMachine(config);
    sm.transition('running');
    sm.reset();

    expect(sm.state).toBe('idle');
    expect(sm.history()).toHaveLength(0);
  });

  it('supports chaining transitions', () => {
    const sm = createStateMachine(config);
    sm.transition('running').transition('paused').transition('running');

    expect(sm.state).toBe('running');
    expect(sm.history()).toHaveLength(3);
  });

  it('includes timestamp in transitions', () => {
    const sm = createStateMachine(config);
    sm.transition('running');

    const history = sm.history();
    expect(history[0].timestamp).toBeDefined();
    expect(() => new Date(history[0].timestamp).toISOString()).not.toThrow();
  });
});
