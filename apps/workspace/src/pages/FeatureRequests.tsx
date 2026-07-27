import { useCallback, useEffect, useState } from 'react';

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  votes: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

const STATUS_COLORS: Record<string, string> = {
  submitted: '#6b7280',
  under_review: '#3b82f6',
  planned: '#a78bfa',
  in_progress: '#f59e0b',
  completed: '#10b981',
  declined: '#ef4444',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};
const CATEGORIES = ['feature', 'improvement', 'integration', 'performance', 'ui', 'api', 'documentation'];
const STATUS_ICONS: Record<string, string> = {
  submitted: '○',
  under_review: '◔',
  planned: '◗',
  in_progress: '◐',
  completed: '●',
  declined: '✕',
};

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.ok ? r.json() : null;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-1">
      <div
        className="h-1 rounded-full transition-all"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function FeatureRequests() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('feature');
  const [newPriority, setNewPriority] = useState('medium');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api('/api/requests');
    if (d) setRequests(d.requests ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setNewTitle('');
    setNewDescription('');
    setNewCategory('feature');
    setNewPriority('medium');
    setShowNew(true);
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    const d = await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify({
        title: newTitle,
        description: newDescription,
        category: newCategory,
        priority: newPriority,
      }),
    });
    if (d) {
      setShowNew(false);
      load();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
    } catch {}
    setUpdating(null);
    load();
  };

  const deleteRequest = async (id: string) => {
    if (!window.confirm('Delete this request?')) return;
    await fetch(`/api/requests/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = requests.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const statusCounts = requests.reduce((acc: Record<string, number>, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const totalDone = requests.filter((r) => r.status === 'completed').length;
  const totalPct = requests.length > 0 ? Math.round((totalDone / requests.length) * 100) : 0;

  if (loading)
    return (
      <div className="w-full px-4 animate-pulse">
        <div className="mb-4">
          <div className="h-8 w-56 bg-zinc-800 rounded mb-2" />
          <div className="h-4 w-40 bg-zinc-800/50 rounded" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 bg-zinc-800/30 rounded-lg" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Feature Requests</h1>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {requests.length} requests · {statusCounts['in_progress'] ?? 0} in progress · {totalDone} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-700 text-[9px]">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-36 bg-zinc-800 border border-zinc-700 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-zinc-300 placeholder-zinc-700 outline-none"
            />
          </div>
          <button onClick={load} className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm" title="Refresh">
            ↻
          </button>
          <button
            onClick={openNew}
            className="text-[10px] px-3 py-1.5 accent-btn rounded-lg cursor-pointer flex items-center gap-1"
          >
            <span>+</span> New Request
          </button>
        </div>
      </div>

      {/* New request modal */}
      {showNew && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowNew(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-[1280px] mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span className="text-accent">+</span> New Feature Request
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Feature title..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the feature..."
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 text-xs outline-none cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 text-xs outline-none cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-zinc-800">
              <button
                onClick={create}
                disabled={!newTitle.trim()}
                className="flex-1 text-[10px] px-3 py-1.5 accent-btn rounded-lg disabled:opacity-30 cursor-pointer"
              >
                Submit
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {requests.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ProgressBar pct={totalPct} color="var(--vestara-accent)" />
            <span className="text-[9px] text-zinc-600 shrink-0">
              {totalDone}/{requests.length} done
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {requests.length === 0 && !showNew && (
        <div className="flex flex-col items-center justify-center py-16 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center">
          <div className="text-2xl mb-2 opacity-20">💡</div>
          <p className="text-sm text-zinc-600 mb-1">No feature requests yet</p>
          <p className="text-[10px] text-zinc-700 mb-4">Submit your first feature request to start tracking ideas</p>
          <button onClick={openNew} className="text-[10px] px-4 py-1.5 accent-btn rounded-lg cursor-pointer">
            + New Request
          </button>
        </div>
      )}

      {requests.length > 0 && (
        <>
          {/* Status filter chips + search */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="flex gap-1 flex-wrap flex-1">
              {[{ key: 'all', label: 'All', count: requests.length }]
                .concat(
                  Object.entries(STATUS_COLORS).map(([key]) => ({
                    key,
                    label: key.replace('_', ' '),
                    count: statusCounts[key] || 0,
                  })),
                )
                .filter((t) => t.count > 0 || t.key === 'all')
                .map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setStatusFilter(t.key)}
                    className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${statusFilter === t.key ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    {STATUS_ICONS[t.key] && <span style={{ color: STATUS_COLORS[t.key] }}>{STATUS_ICONS[t.key]}</span>}
                    {t.label}
                    <span className={`text-[8px] ${statusFilter === t.key ? 'text-zinc-400' : 'text-zinc-700'}`}>
                      {t.count}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div
                key={status}
                className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg border-l-[3px] text-center"
                style={{ borderLeftColor: color }}
              >
                <div
                  className="text-sm font-bold"
                  style={{ color: (statusCounts[status] || 0) > 0 ? color : '#52525b' }}
                >
                  {statusCounts[status] ?? 0}
                </div>
                <div className="text-[8px] text-zinc-600 uppercase tracking-wider">{status.replace('_', ' ')}</div>
              </div>
            ))}
          </div>

          {/* Requests list */}
          <div className="space-y-1.5">
            {filtered.map((r) => {
              const isExpanded = expanded === r.id;
              const pct = ['completed', 'in_progress'].includes(r.status)
                ? { submitted: 20, under_review: 40, planned: 60, in_progress: 80, completed: 100 }[r.status] || 0
                : 0;
              return (
                <div key={r.id}>
                  <div
                    className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors cursor-pointer border-l-[3px]"
                    style={{ borderLeftColor: STATUS_COLORS[r.status] || '#6b7280' }}
                    onClick={() => setExpanded(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: PRIORITY_COLORS[r.priority] }}
                      />
                      <span className="text-sm text-zinc-200 font-medium truncate flex-1">{r.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={r.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateStatus(r.id, e.target.value);
                          }}
                          className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                          disabled={updating === r.id}
                        >
                          {Object.keys(STATUS_COLORS).map((s) => (
                            <option key={s} value={s}>
                              {s.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                        <span
                          className="text-[8px] px-1 py-0.5 rounded uppercase font-medium"
                          style={{
                            backgroundColor: `${PRIORITY_COLORS[r.priority]}15`,
                            color: PRIORITY_COLORS[r.priority],
                          }}
                        >
                          {r.priority}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-zinc-600">
                      <span className="capitalize">{r.category}</span>
                      {r.tags?.length > 0 && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{r.tags.join(', ')}</span>
                        </>
                      )}
                      <span className="ml-auto text-zinc-700">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="ml-3 mt-0.5 p-3 bg-zinc-800/30 border border-zinc-700/50 rounded-lg space-y-2">
                      {r.description && (
                        <div className="text-[10px] text-zinc-400 leading-relaxed">{r.description}</div>
                      )}
                      <div className="flex items-center gap-2 text-[8px] text-zinc-700">
                        <span>Created {new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.updatedAt && (
                          <>
                            <span>·</span>
                            <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRequest(r.id);
                          }}
                          className="text-[8px] px-1.5 py-0.5 bg-red-400/10 border border-red-400/20 text-red-400 rounded hover:bg-red-400/20 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && search.trim() && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-lg mb-1 opacity-20">🔍</div>
                <p className="text-[10px] text-zinc-700">No matching requests</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
