export type ConnectionStateName = 'connecting' | 'connected' | 'disconnected' | 'degraded' | 'error';

export interface ConnectionState {
  readonly name: ConnectionStateName;
  readonly message?: string;
  readonly since: string;
}

export interface ConnectionAction {
  readonly type: 'set';
  readonly state: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly message?: string;
}

export function initialConnectionState(): ConnectionState {
  return { name: 'connecting', since: new Date().toISOString() };
}

export function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  if (action.type !== 'set') return state;
  let name: ConnectionStateName = action.state;
  // A heartbeat implies liveness even if the last observed state was erroring.
  if (action.state === 'connected') name = 'connected';
  if (action.state === 'error') name = 'error';
  return { name, message: action.message, since: new Date().toISOString() };
}

export interface ConnectionPresentation {
  readonly label: string;
  readonly tone: 'success' | 'warning' | 'error' | 'info';
  readonly recoverable: boolean;
  readonly description: string;
}

export function presentConnection(state: ConnectionState): ConnectionPresentation {
  switch (state.name) {
    case 'connected':
      return { label: 'Connected', tone: 'success', recoverable: false, description: 'Runtime connected.' };
    case 'connecting':
      return {
        label: 'Connecting',
        tone: 'info',
        recoverable: true,
        description: 'Connecting to the Vestara runtime…',
      };
    case 'disconnected':
      return {
        label: 'Offline',
        tone: 'warning',
        recoverable: true,
        description: 'The Vestara API is unavailable. Existing session data remains visible.',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        tone: 'warning',
        recoverable: true,
        description: 'The runtime is reachable but a capability is degraded.',
      };
    case 'error':
      return {
        label: 'Error',
        tone: 'error',
        recoverable: true,
        description: state.message ?? 'The runtime reported an error.',
      };
  }
}

export function isOperational(state: ConnectionState): boolean {
  return state.name === 'connected';
}

export function isRecoverable(state: ConnectionState): boolean {
  return presentConnection(state).recoverable;
}
