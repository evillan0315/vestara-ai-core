import { useCallback, useEffect, useMemo, useState } from 'react';
import { VestaraModal } from '../components/ui/VestaraModal';

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
  submitted: '#6b7280', under_review: '#3b82f6', planned: '#a78bfa',
  in_progress: '#f59e0b', completed: '#10b981', declined: '#ef4444',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626',
};
const CATEGORIES = ['feature', 'improvement', 'integration', 'performance', 'ui', 'api', 'documentation'];
const STATUS_ICONS: Record<string, string> = {
  submitted: '○', under_review: '◔', planned: '◗', in_progress: '◐', completed: '●', declined: '✕',
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-sm font-bold mt-1" style={{ color: (typeof value === 'number' && value > 0) ? accent : '#52525b' }}>{value}</div>
    </div>
  );
}

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.ok ? r.json() : null;
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

  useEffect(() => { load(); }, [load]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [requests]);

  const filtered = requests.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags?.some((t) => t.toLowerCase().includes(q));
    }
    return true;
  });

  // Modal and action handlers stay the same
  const openNew = () => { setNewTitle(''); setNewDescription(''); setNewCategory('feature'); setNewPriority('medium'); setShowNew(true); };
  const create = async () => {
    if (!newTitle.trim()) return;
    const d = await api('/api/requests', { method: 'POST', body: JSON.stringify({ title: newTitle, description: newDescription, category: newCategory, priority: newPriority }) });
    if (d) { setShowNew(false); load(); }
  };
  const updateStatus = async (id: string, status: string) => {
    setUpdating(id); try { await fetch(`/api/requests/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); } catch {} finally { setUpdating(null); load(); }
  };
  const deleteRequest = async (id: string) => {
    if (!window.confirm('Delete this request?')) return;
    await fetch(`/api/requests/${id}`, { method: 'DELETE' }); load();
  };

  if (loading) return <div className="w-full animate-pulse"><div className="mb-4"><div className="h-8 w-56 bg-(--vestara-accent-bg) rounded mb-2" /><div className="h-4 w-40 bg-(--vestara-accent-bg) rounded" /></div><div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">{[1, 2, 3, 4, 5, 6].map((i) => (<div key={i} className="h-16 bg-(--vestara-accent-bg) rounded-lg" />))}</div></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Feature Requests</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">{requests.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[10px]">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-36 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none" />
          </div>
          <button onClick={load} className="text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer text-sm">↻</button>
          <button onClick={openNew} className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-accent) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer font-medium">+ New Request</button>
        </div>
      </div>

      {/* New request modal */}
      {showNew && (
        <VestaraModal onClose={() => setShowNew(false)} className="max-w-lg">
          <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border)">
            <h2 className="text-sm font-semibold text-(--vestara-text)">+ New Feature Request</h2>
            <button onClick={() => setShowNew(false)} className="text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer text-sm">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Feature title..." className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-2 py-1.5 text-sm text-(--vestara-text) outline-none" onKeyDown={(e) => e.key === 'Enter' && create()} />
            </div>
            <div>
              <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Description</label>
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Describe the feature..." rows={3} className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-2 py-1.5 text-sm text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Category</label>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded px-2 py-1.5 text-xs outline-none cursor-pointer">
                  {CATEGORIES.map((c) => (<option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Priority</label>
                <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded px-2 py-1.5 text-xs outline-none cursor-pointer">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-2 p-4 border-t border-(--vestara-accent-border)">
            <button onClick={create} disabled={!newTitle.trim()} className="flex-1 text-[10px] px-3 py-1.5 bg-(--vestara-accent) text-white rounded-lg disabled:opacity-30 cursor-pointer font-medium">Submit</button>
            <button onClick={() => setShowNew(false)} className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) cursor-pointer">Cancel</button>
          </div>
        </VestaraModal>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total" value={requests.length} accent="#8b5cf6" />
        <StatCard label="Open" value={(statusCounts['submitted'] || 0) + (statusCounts['under_review'] || 0) + (statusCounts['planned'] || 0)} accent="#3b82f6" />
        <StatCard label="In Progress" value={statusCounts['in_progress'] ?? 0} accent="#f59e0b" />
        <StatCard label="Completed" value={statusCounts['completed'] ?? 0} accent="#10b981" />
      </div>

      {/* Empty state */}
      {requests.length === 0 && !showNew && (
        <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
          <div className="text-2xl mb-2 opacity-20">💡</div>
          <p className="text-sm text-(--vestara-text-muted) mb-1">No feature requests yet</p>
          <p className="text-[10px] text-(--vestara-text-dim) mb-4">Submit your first feature request to start tracking ideas</p>
          <button onClick={openNew} className="text-[10px] px-4 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-accent) rounded-lg cursor-pointer font-medium">+ New Request</button>
        </div>
      )}

      {requests.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="flex gap-1 flex-wrap flex-1">
              {[{ key: 'all', label: 'All', count: requests.length }].concat(Object.entries(STATUS_COLORS).map(([key]) => ({ key, label: key.replace('_', ' '), count: statusCounts[key] || 0 })))
                .filter((t) => t.count > 0 || t.key === 'all').map((t) => (
                  <button key={t.key} onClick={() => setStatusFilter(t.key)}
                    className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${statusFilter === t.key ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'}`}>
                    {t.label} <span className="text-[8px] text-(--vestara-text-dim)">{t.count}</span>
                  </button>
                ))}
            </div>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {filtered.map((r) => {
              const isExpanded = expanded === r.id;
              return (
                <div key={r.id}>
                  <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors cursor-pointer border-l-[3px]" style={{ borderLeftColor: STATUS_COLORS[r.status] || '#6b7280' }}
                    onClick={() => setExpanded(isExpanded ? null : r.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[r.priority] }} />
                      <span className="text-sm font-medium text-(--vestara-text) truncate flex-1">{r.title}</span>
                      <select value={r.status} onChange={(e) => { e.stopPropagation(); updateStatus(r.id, e.target.value); }}
                        className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                        onClick={(e) => e.stopPropagation()} disabled={updating === r.id}>
                        {Object.keys(STATUS_COLORS).map((s) => (<option key={s} value={s}>{s.replace('_', ' ')}</option>))}
                      </select>
                      <span className="text-[8px] px-1 py-0.5 rounded uppercase font-medium" style={{ backgroundColor: `${PRIORITY_COLORS[r.priority]}15`, color: PRIORITY_COLORS[r.priority] }}>{r.priority}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-(--vestara-text-muted)">
                      <span className="capitalize">{r.category}</span>
                      {r.tags?.length > 0 && (<><span className="text-(--vestara-text-dim)">·</span><span>{r.tags.join(', ')}</span></>)}
                      <span className="ml-auto text-(--vestara-text-dim)">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="ml-3 mt-0.5 p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg space-y-2">
                      {r.description && <div className="text-[10px] text-(--vestara-text-2) leading-relaxed">{r.description}</div>}
                      <div className="flex items-center gap-2 text-[8px] text-(--vestara-text-dim)">
                        <span>Created {new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.updatedAt && (<><span>·</span><span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span></>)}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteRequest(r.id); }}
                        className="text-[8px] px-1.5 py-0.5 bg-red-400/10 border border-red-400/20 text-red-400 rounded hover:bg-red-400/20 cursor-pointer">Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && search.trim() && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-lg mb-1 opacity-20">🔍</div>
                <p className="text-[10px] text-(--vestara-text-dim)">No matching requests</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
