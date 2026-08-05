import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type OpenCodeSessionDetail, openCodeApi } from '../../lib/opencode';
import { OpenCodeSessionDeleteDialog } from './OpenCodeSessionDeleteDialog';
import { OpenCodeSessionStatusBadge } from './OpenCodeSessionStatusBadge';

export function OpenCodeSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<OpenCodeSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await openCodeApi.session(sessionId);
    setSession(result);
    setNotFound(result === null);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    setDeletePending(true);
    setDeleteError(null);
    const ok = await openCodeApi.deleteSession(sessionId);
    setDeletePending(false);
    if (ok) {
      navigate('/opencode/sessions');
    } else {
      setDeleteError('Delete failed. The session may no longer exist.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-[11px] text-(--vestara-text-muted) animate-pulse">Loading session…</div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => navigate('/opencode/sessions')}
            className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
            aria-label="Back to sessions"
          >
            <ArrowBackRoundedIcon fontSize="inherit" className="text-[16px]" />
          </button>
          <h1 className="text-lg font-bold text-(--vestara-text)">Session Not Found</h1>
        </div>
        <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-[11px] text-(--vestara-text-muted)">
          This session does not exist or was deleted upstream.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate('/opencode/sessions')}
          className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
          aria-label="Back to sessions"
        >
          <ArrowBackRoundedIcon fontSize="inherit" className="text-[16px]" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-(--vestara-text) truncate">{session.title}</h1>
            <OpenCodeSessionStatusBadge status={session.status} />
          </div>
          <p className="text-[10px] font-mono text-(--vestara-text-muted) mt-0.5">{session.id}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 hover:text-red-300 cursor-pointer"
        >
          <DeleteRoundedIcon fontSize="inherit" /> Delete
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">Workspace</div>
          <div className="text-[11px] text-(--vestara-text-2) truncate">{session.directory || '—'}</div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">Agent / Model</div>
          <div className="text-[11px] text-(--vestara-text-2)">
            {session.agent ?? '—'}
            {session.model?.id ? ` · ${session.model.id}` : ''}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">Activity</div>
          <div className="text-[11px] text-(--vestara-text-2)">
            {session.filesChanged} files · +{session.additions}/-{session.deletions}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">Created</div>
          <div className="text-[11px] text-(--vestara-text-2)">
            {session.createdAt ? new Date(session.createdAt).toLocaleString() : '—'}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">Updated</div>
          <div className="text-[11px] text-(--vestara-text-2)">
            {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['Activity', 'Changes', 'Todos', 'Evidence'] as const).map((placeholder) => (
          <div
            key={placeholder}
            className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg"
          >
            <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">{placeholder}</div>
            <p className="text-[10px] text-(--vestara-text-dim)">
              Live {placeholder.toLowerCase()} arrives with execution streaming.
            </p>
          </div>
        ))}
      </div>

      {deleteOpen && (
        <OpenCodeSessionDeleteDialog
          sessionTitle={session.title}
          pending={deletePending}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
