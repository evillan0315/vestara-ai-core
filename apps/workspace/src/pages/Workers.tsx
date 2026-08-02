import { useCallback, useEffect, useState } from 'react';

/**
 * Workers — PCS-027 distributed worker cluster.
 *
 * Lists registered worker nodes (status, load, capabilities, executors,
 * heartbeat) and active task leases. Nodes connect over /ws/worker.
 */

const API = '/api/workers';

interface WorkerNode {
  id: string;
  hostname: string;
  status: string;
  executors: string[];
  capabilities: string[];
  load: number;
  lastHeartbeatAt: string;
  registeredAt: string;
}

interface TaskLease {
  leaseId: string;
  executionId: string;
  nodeId: string;
  task: { summary: string };
  expiresAt: string;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const NODE_STATUS_BADGE: Record<string, string> = {
  online: 'bg-emerald-500/15 text-emerald-300',
  offline: 'bg-red-500/15 text-red-300',
  draining: 'bg-amber-500/15 text-amber-300',
  unknown: 'bg-zinc-600/20 text-zinc-300',
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
    </div>
  );
}

export default function WorkersPage() {
  const [nodes, setNodes] = useState<WorkerNode[]>([]);
  const [online, setOnline] = useState(0);
  const [leases, setLeases] = useState<TaskLease[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nodeData, leaseData] = await Promise.all([
      fetchJson<{ nodes: WorkerNode[]; online: number }>(`${API}/nodes`),
      fetchJson<{ leases: TaskLease[] }>(`${API}/leases`),
    ]);
    if (nodeData) {
      setNodes(nodeData.nodes ?? []);
      setOnline(nodeData.online ?? 0);
    }
    setLeases(leaseData?.leases ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Worker Cluster</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Distributed workers · registration · heartbeats · scheduling (PCS-027)
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Nodes" value={nodes.length} accent="#8b5cf6" />
        <StatCard label="Online" value={online} accent="#10b981" />
        <StatCard label="Active leases" value={leases.length} accent="#6366f1" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-(--vestara-text-muted)">Loading workers...</div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-4xl text-(--vestara-text-2) mb-3">🖥</div>
          <p className="text-sm text-(--vestara-text-2)">No worker nodes registered</p>
          <p className="text-xs text-(--vestara-text-muted) mt-1">
            Run a node: <code className="text-(--vestara-accent-text)">WORKER_URL=ws://localhost:3001/ws/worker WORKER_ID=node-a node apps/api/dist/worker/worker-node-bootstrap.js</code>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {nodes.map((node) => (
            <div key={node.id} className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40 p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-(--vestara-text)">{node.id}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${NODE_STATUS_BADGE[node.status] ?? 'bg-zinc-600/20 text-zinc-300'}`}>
                      {node.status}
                    </span>
                    <span className="text-[10px] text-(--vestara-text-dim)">{node.hostname}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-(--vestara-text-2)">
                    <span>load {(node.load * 100).toFixed(0)}%</span>
                    <span>·</span>
                    <span>{node.executors.length > 0 ? `executors: ${node.executors.join(', ')}` : 'no executors'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {node.capabilities.map((capability) => (
                      <span key={capability} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-(--vestara-text-2)">
                        {capability}
                      </span>
                    ))}
                    {node.capabilities.length === 0 && (
                      <span className="text-[10px] text-(--vestara-text-dim)">any capability</span>
                    )}
                  </div>
                  <p className="text-[10px] text-(--vestara-text-dim) mt-1">
                    heartbeat {new Date(node.lastHeartbeatAt).toLocaleTimeString()} · registered {new Date(node.registeredAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {leases.length > 0 && (
            <div className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)/40 p-4">
              <div className="text-xs font-medium text-(--vestara-text-2) mb-2">Active leases</div>
              <div className="space-y-1">
                {leases.map((lease) => (
                  <div key={lease.leaseId} className="flex items-center gap-2 text-xs">
                    <span className="text-(--vestara-text)">{lease.task.summary}</span>
                    <span className="text-(--vestara-text-dim)">→ {lease.nodeId}</span>
                    <span className="text-(--vestara-text-dim)">{lease.executionId}</span>
                    <span className="text-(--vestara-text-dim) ml-auto">expires {new Date(lease.expiresAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
