import { useEffect, useState } from 'react';
import type { WorkspaceEvent } from './ws';
import { workspaceSocket } from './ws';

export type MarketplaceOperationState =
  | 'requested'
  | 'planning'
  | 'awaiting-permission'
  | 'running'
  | 'verifying'
  | 'activating'
  | 'rolling-back'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MarketplaceOperationEntry {
  key: string;
  packageName?: string;
  state: MarketplaceOperationState;
  eventType: string;
  message: string;
  timestamp: string;
}

/** Lifecycle events → derived operation state (mirrors the API operation DTO vocabulary). */
const EVENT_STATE: Record<string, MarketplaceOperationState> = {
  'marketplace.install-requested': 'running',
  'marketplace.permission-requested': 'awaiting-permission',
  'marketplace.package-verified': 'verifying',
  'marketplace.package-installed': 'running',
  'marketplace.package-activated': 'activating',
  'marketplace.package-deactivated': 'rolling-back',
  'marketplace.rollback-completed': 'completed',
  'marketplace.package-uninstalled': 'completed',
  'marketplace.install-failed': 'failed',
  'marketplace.registry.scanned': 'completed',
};

function metadataOf(event: WorkspaceEvent): Record<string, unknown> {
  return ((event as unknown as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
}

/**
 * Live operation tracking from `marketplace.*` WebSocket events. The API's
 * event bridge publishes lifecycle events with the same vocabulary the CLI and
 * service observe — no polling, no per-package progress model.
 */
export function useMarketplaceOperations(limit = 20): {
  operations: MarketplaceOperationEntry[];
  lastEvent: MarketplaceOperationEntry | null;
} {
  const [operations, setOperations] = useState<MarketplaceOperationEntry[]>([]);
  const [lastEvent, setLastEvent] = useState<MarketplaceOperationEntry | null>(null);

  useEffect(() => {
    const off = workspaceSocket.onEvent((event) => {
      if (!event.type?.startsWith('marketplace.')) return;
      const state = EVENT_STATE[event.type];
      if (!state) return;
      const payload = metadataOf(event);
      const packageName = (payload.packageName as string) ?? event.message;
      const correlationId = (payload.correlationId as string) ?? event.id;
      const key = `${packageName ?? 'registry'}:${correlationId}`;
      const entry: MarketplaceOperationEntry = {
        key,
        packageName,
        state,
        eventType: event.type,
        message: event.message ?? event.type,
        timestamp: event.timestamp,
      };
      setLastEvent(entry);
      setOperations((previous) => {
        const withoutDuplicate = previous.filter((item) => item.key !== key);
        return [entry, ...withoutDuplicate].slice(0, limit);
      });
    });
    return off;
  }, [limit]);

  return { operations, lastEvent };
}
