import { describe, expect, it } from 'vitest';
import {
  connectionReducer,
  initialConnectionState,
  isOperational,
  isRecoverable,
  presentConnection,
} from '../src/state/connection-state.js';

describe('connection state reducer', () => {
  it('starts in the connecting state', () => {
    const state = initialConnectionState();
    expect(state.name).toBe('connecting');
    expect(isOperational(state)).toBe(false);
  });

  it('transitions to connected', () => {
    const state = connectionReducer(initialConnectionState(), { type: 'set', state: 'connected' });
    expect(state.name).toBe('connected');
    expect(isOperational(state)).toBe(true);
    expect(presentConnection(state).label).toBe('Connected');
  });

  it('preserves disconnected as offline', () => {
    const state = connectionReducer(initialConnectionState(), { type: 'set', state: 'disconnected' });
    expect(state.name).toBe('disconnected');
    expect(isOperational(state)).toBe(false);
    expect(presentConnection(state).label).toBe('Offline');
    expect(isRecoverable(state)).toBe(true);
  });

  it('records error message', () => {
    const state = connectionReducer(initialConnectionState(), {
      type: 'set',
      state: 'error',
      message: 'provider unavailable',
    });
    expect(state.name).toBe('error');
    expect(state.message).toBe('provider unavailable');
    expect(presentConnection(state).label).toBe('Error');
  });

  it('recovers from error to connected', () => {
    const errored = connectionReducer(initialConnectionState(), { type: 'set', state: 'error' });
    const recovered = connectionReducer(errored, { type: 'set', state: 'connected' });
    expect(recovered.name).toBe('connected');
    expect(isOperational(recovered)).toBe(true);
  });
});
