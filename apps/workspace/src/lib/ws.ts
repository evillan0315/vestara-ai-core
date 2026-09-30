import { resolveWsUrl } from './clientConfig';

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

export interface WorkspaceEvent {
  id: string;
  type: string;
  actor: string;
  sessionId?: string;
  artifactId?: string;
  message?: string;
  timestamp: string;
  payload?: unknown;
}

type Listener = (event: WorkspaceEvent) => void;
type StateListener = (state: ConnectionState) => void;

class WorkspaceSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'closed';
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private reconnectTimer: number | null = null;
  private intentionalClose = false;

  connect(): void {
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = resolveWsUrl('/ws');
    this.setState('connecting');

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.setState('error');
      this.scheduleReconnect();
      return;
    }

    const socket = this.ws;

    socket.onopen = () => {
      if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) return;
      this.setState('open');
      try {
        socket.send(JSON.stringify({ op: 'subscribe', channels: ['workspace'] }));
      } catch {
        this.setState('error');
      }
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { op?: string; event?: WorkspaceEvent };
        if (msg.op === 'event' && msg.event) {
          for (const l of this.listeners) l(msg.event);
        }
      } catch {
        /* ignore malformed */
      }
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      this.setState('error');
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.setState('closed');
      this.ws = null;
      if (!this.intentionalClose) this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    }
    this.setState('closed');
  }

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const l of this.stateListeners) l(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}

export const workspaceSocket = new WorkspaceSocket();
