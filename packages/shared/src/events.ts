// ─── Event Bus ───────────────────────────────────────────────

export interface VestaraEvent {
  id: string;
  type: string;
  version: number;
  timestamp: string;
  source: string;
  actor?: { id: string; role: 'user' | 'system' | 'agent' };
  payload: Record<string, unknown>;
  metadata: {
    correlationId: string;
    causationId?: string;
    retryCount: number;
    ttl: number;
  };
}

export type EventHandler<T = unknown> = (event: VestaraEvent & { payload: T }) => Promise<void>;

export type Unsubscribe = () => void;
