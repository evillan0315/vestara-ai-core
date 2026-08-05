import { describe, expect, it } from 'vitest';
import {
  cancelExecution,
  clearExecution,
  createStreamGate,
  gateStreamEvent,
  startExecution,
} from '../src/state/stream-gate.js';

describe('stream event gate', () => {
  it('rejects events before any execution is active', () => {
    const gate = createStreamGate();
    expect(gateStreamEvent(gate, { kind: 'conversation-delta', executionId: 'exec-1' })).toEqual({
      apply: false,
      reason: 'no-active-execution',
    });
  });

  it('accepts events for the active execution', () => {
    let gate = createStreamGate();
    gate = startExecution(gate, 'exec-1');
    expect(gateStreamEvent(gate, { kind: 'conversation-delta', executionId: 'exec-1' })).toEqual({
      apply: true,
      reason: 'active',
    });
  });

  it('rejects events from a prior execution', () => {
    let gate = createStreamGate();
    gate = startExecution(gate, 'exec-2');
    expect(gateStreamEvent(gate, { kind: 'conversation-delta', executionId: 'exec-1' })).toEqual({
      apply: false,
      reason: 'stale',
    });
  });

  it('rejects all events once cancelled', () => {
    let gate = createStreamGate();
    gate = startExecution(gate, 'exec-1');
    gate = cancelExecution(gate);
    expect(gateStreamEvent(gate, { kind: 'conversation-delta', executionId: 'exec-1' })).toEqual({
      apply: false,
      reason: 'cancelled',
    });
  });

  it('clears the active execution and reopens the gate', () => {
    let gate = createStreamGate();
    gate = startExecution(gate, 'exec-1');
    gate = cancelExecution(gate);
    gate = clearExecution(gate);
    expect(gate.activeExecutionId).toBeUndefined();
    expect(gate.cancelled).toBe(false);
    expect(gateStreamEvent(gate, { kind: 'conversation-delta', executionId: 'exec-1' }).reason).toBe(
      'no-active-execution',
    );
  });

  it('starts a fresh execution after clear', () => {
    let gate = createStreamGate();
    gate = startExecution(gate, 'exec-1');
    gate = clearExecution(gate);
    gate = startExecution(gate, 'exec-2');
    expect(gateStreamEvent(gate, { kind: 'tool', executionId: 'exec-2' }).apply).toBe(true);
    expect(gateStreamEvent(gate, { kind: 'tool', executionId: 'exec-1' }).apply).toBe(false);
  });
});
