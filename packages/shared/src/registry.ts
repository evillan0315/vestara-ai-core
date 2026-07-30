// ─── Service Registry ────────────────────────────────────────

import type { ServiceStatus } from './lifecycle.js';

export interface ServiceInfo {
  id: string;
  version: string;
  status: ServiceStatus;
  capabilities: string[];
  dependencies: string[];
  uptime: number;
}

export type ServiceRegistryEventType = 'registered' | 'unregistered' | 'status-changed';

export interface ServiceRegistryEvent {
  type: ServiceRegistryEventType;
  serviceId: string;
  timestamp: string;
}
