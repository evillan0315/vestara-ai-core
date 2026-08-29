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
    /** ARX-015 M2: Canonical execution identity. Source of truth for correlationId. */
    executionId?: string;
    /** ARX-015 M2: Transport/request identity. Single HTTP/WS request lifecycle. */
    requestId?: string;
    /** ARX-015 M2: Distributed causal trace. Groups events across processes. */
    traceId?: string;
    retryCount: number;
    ttl: number;
  };
}

export type EventHandler<T = unknown> = (event: VestaraEvent & { payload: T }) => Promise<void>;

export type Unsubscribe = () => void;
