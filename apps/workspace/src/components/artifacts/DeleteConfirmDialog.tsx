import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';
import { VestaraModal } from '../ui/VestaraModal';

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
    <VestaraModal onClose={onClose} className="max-w-sm">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-(--vestara-text) mb-2">Delete Artifact</h3>
        <p className="text-xs text-(--vestara-text-2) mb-1">Are you sure you want to delete this artifact?</p>
        <p className="text-xs text-(--vestara-text) font-mono bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded p-2 mb-3">{artifact.title || artifact.goal || artifact.id}</p>
        <p className="text-[10px] text-(--vestara-red) mb-4">This action cannot be undone.</p>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={loading}
            className="text-xs px-4 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 cursor-pointer font-medium">
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </VestaraModal>
  );
}
