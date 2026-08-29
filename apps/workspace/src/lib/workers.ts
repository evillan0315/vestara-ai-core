/**
 * Workers (PCS-027) Workspace client.
 *
 * Typed fetch wrappers over the apps/api workers routes.
 */

export interface WorkerNodeDto {
  id: string;
  hostname: string;
  status: string;
  executors: string[];
  capabilities: string[];
  load: number;
  lastHeartbeatAt: string;
  registeredAt: string;
}

export interface TaskLeaseDto {
  leaseId: string;
  executionId: string;
  nodeId: string;
  task: { summary: string };
  expiresAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Workers API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const workersApi = {
  async listNodes(): Promise<{ nodes: WorkerNodeDto[]; online: number }> {
    return request<{ nodes: WorkerNodeDto[]; online: number }>('/api/workers/nodes');
  },

  async listLeases(): Promise<{ leases: TaskLeaseDto[] }> {
    return request<{ leases: TaskLeaseDto[] }>('/api/workers/leases');
  },

  async enableScheduling(nodeId: string): Promise<{ node: WorkerNodeDto }> {
    return request<{ node: WorkerNodeDto }>(
      `/api/workers/${encodeURIComponent(nodeId)}/scheduling/enable`,
      { method: 'POST' },
    );
  },

  async disableScheduling(nodeId: string): Promise<{ node: WorkerNodeDto }> {
    return request<{ node: WorkerNodeDto }>(
      `/api/workers/${encodeURIComponent(nodeId)}/scheduling/disable`,
      { method: 'POST' },
    );
  },

  async reconcileDraining(): Promise<{ reconciled: string[] }> {
    return request<{ reconciled: string[] }>('/api/workers/drain/reconcile', { method: 'POST' });
  },
};
