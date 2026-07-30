import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';

interface Props {
  open: boolean;
  artifact: { id: string; title?: string; goal?: string } | null;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteConfirmDialog({ open, artifact, onClose, onDeleted }: Props) {
  const [loading, setLoading] = useState(false);
  const toasts = useToasts();

  const handleDelete = useCallback(async () => {
    if (!artifact) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plans/${artifact.id}`, { method: 'DELETE' });
      if (!res.ok) { toasts.addToast({ type: 'error', message: 'Delete failed' }); setLoading(false); return; }
      toasts.addToast({ type: 'success', message: 'Artifact deleted' });
      onClose();
      onDeleted();
    } catch { toasts.addToast({ type: 'error', message: 'Network error' }); }
    setLoading(false);
  }, [artifact, onClose, onDeleted, toasts]);

  if (!open || !artifact) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Delete Artifact</h3>
        <p className="text-xs text-zinc-400 mb-1">Are you sure you want to delete this artifact?</p>
        <p className="text-xs text-zinc-300 font-mono bg-zinc-800 rounded p-2 mb-3">{artifact.title || artifact.goal || artifact.id}</p>
        <p className="text-[10px] text-red-400 mb-4">This action cannot be undone.</p>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 cursor-pointer">Cancel</button>
          <button onClick={handleDelete} disabled={loading}
            className="text-xs px-4 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 cursor-pointer font-medium">
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
