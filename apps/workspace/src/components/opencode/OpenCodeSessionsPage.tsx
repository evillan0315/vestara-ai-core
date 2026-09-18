import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type OpenCodeSessionView, type OpenCodeSessionViewStatus, openCodeApi } from '../../lib/opencode';
import { RouteHero } from '../layout/PageHero/RouteHero';
import { OpenCodeSessionDeleteDialog } from './OpenCodeSessionDeleteDialog';
import { OpenCodeSessionEmptyState } from './OpenCodeSessionEmptyState';
import { OpenCodeSessionTable } from './OpenCodeSessionTable';

type StatusFilter = 'all' | OpenCodeSessionViewStatus;
type ViewState = 'loading' | 'ready' | 'offline';

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'idle', label: 'Idle' },
  { id: 'failed', label: 'Failed' },
  { id: 'unknown', label: 'Unknown' },
];

export function OpenCodeSessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<OpenCodeSessionView[] | null>(null);
  const [view, setView] = useState<ViewState>('loading');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<OpenCodeSessionView | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [abortedIds, setAbortedIds] = useState<ReadonlySet<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const result = await openCodeApi.sessions();
    if (result !== null) {
      setSessions(result);
      setView('ready');
    } else {
      setView('offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    timer.current = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const term = search.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesFilter = filter === 'all' || session.status === filter;
      const matchesSearch =
        term.length === 0 || session.title.toLowerCase().includes(term) || session.id.toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [sessions, search, filter]);

  const sessionStats = useMemo(() => {
    const values = sessions ?? [];
    return {
      total: values.length,
      active: values.filter((session) => session.status === 'active').length,
      idle: values.filter((session) => session.status === 'idle').length,
      failed: values.filter((session) => session.status === 'failed').length,
    };
  }, [sessions]);

  const handleRename = async (session: OpenCodeSessionView, title: string) => {
    const updated = await openCodeApi.renameSession(session.id, title);
    if (updated) {
      setSessions((prev) => prev?.map((s) => (s.id === session.id ? { ...s, title: updated.title } : s)) ?? null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    setDeleteError(null);
    const ok = await openCodeApi.deleteSession(deleteTarget.id);
    setDeletePending(false);
    if (ok) {
      setSessions((prev) => prev?.filter((s) => s.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } else {
      setDeleteError('Delete failed. The session may no longer exist.');
    }
  };

  const handleAbort = async (session: OpenCodeSessionView) => {
    // Abort is a controlled mutation — the live execution feed arrives in OCV-UI-003.
    const res = await fetch(`/api/opencode/sessions/${encodeURIComponent(session.id)}/abort`, { method: 'POST' });
    if (res.ok) setAbortedIds((prev) => new Set(prev).add(session.id));
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <RouteHero
        routeId="opencode-sessions"
        eyebrow={view === 'offline' ? 'Runtime offline' : view === 'loading' ? 'Connecting' : 'OpenCode runtime'}
        statusTone={
          view === 'offline' ? 'error' : view === 'loading' ? 'warning' : 'success'
        }
        search={
          view === 'ready' && sessionStats.total > 0
            ? {
                value: search,
                onChange: setSearch,
                placeholder: 'Search sessions…',
                inputId: 'opencode-session-search',
                label: 'Search OpenCode sessions',
              }
            : undefined
        }
        actions={[
          { label: 'New Session', primary: true, glyph: '＋', onClick: () => navigate('/opencode/sessions/new'), disabled: view === 'offline' },
          { label: 'Refresh', glyph: '↻', onClick: () => void load() },
        ]}
        stats={
          view === 'ready'
            ? [
                { label: 'sessions', value: sessionStats.total },
                { label: 'active', value: sessionStats.active },
                { label: 'idle', value: sessionStats.idle },
                { label: 'failed', value: sessionStats.failed },
              ]
            : undefined
        }
      />

      {view === 'loading' && (
        <div className="p-6 text-center text-[11px] text-(--vestara-text-muted) animate-pulse">Loading sessions…</div>
      )}

      {view === 'offline' && (
        <>
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="text-[12px] font-medium text-red-400">OpenCode is unreachable</div>
            <p className="text-[11px] text-(--vestara-text-muted) mt-0.5">
              Sessions cannot be listed or created while the governed runtime is offline.
            </p>
            <button
              type="button"
              onClick={() => {
                setView('loading');
                void load();
              }}
              className="mt-2 text-[10px] px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 hover:text-red-300 cursor-pointer"
            >
              Retry
            </button>
          </div>
          <OpenCodeSessionEmptyState offline />
        </>
      )}

      {view === 'ready' && (
        <>
          {sessions === null || sessions.length === 0 ? (
            <OpenCodeSessionEmptyState />
          ) : (
            <>
               <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 mb-3">
                 <span className="px-1 text-[10px] font-medium text-(--vestara-text-muted)">
                   {filtered.length} of {sessions.length} sessions
                 </span>
                <div className="flex gap-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`text-[10px] px-2 py-1.5 rounded transition-colors cursor-pointer ${
                        filter === f.id
                          ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)'
                          : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="p-4 text-[11px] text-(--vestara-text-muted)">No sessions match the current filter.</p>
              ) : (
                <OpenCodeSessionTable
                  sessions={filtered}
                  onRename={handleRename}
                  onDelete={(session) => {
                    setDeleteError(null);
                    setDeleteTarget(session);
                  }}
                  onAbort={handleAbort}
                  abortedIds={abortedIds}
                />
              )}
            </>
          )}
        </>
      )}

      {deleteTarget && (
        <OpenCodeSessionDeleteDialog
          sessionTitle={deleteTarget.title}
          pending={deletePending}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
