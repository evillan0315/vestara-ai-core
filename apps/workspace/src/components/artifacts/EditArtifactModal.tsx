import { useCallback, useEffect, useState } from 'react';
import { useToasts } from '../Toast';
import { VestaraModal } from '../ui/VestaraModal';

interface Props {
  open: boolean;
  artifact: { id: string; title?: string; goal?: string; status: string } | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditArtifactModal({ open, artifact, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toasts = useToasts();

  useEffect(() => {
    if (artifact) {
      setTitle(artifact.title || '');
      setGoal(artifact.goal || '');
      setError('');
    }
  }, [artifact]);

  const handleSave = useCallback(async () => {
    if (!artifact) return;
    if (!title.trim() && !goal.trim()) { setError('At least one field is required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/plans/${artifact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || undefined, goal: goal.trim() || undefined }),
      });
      if (!res.ok) { setError(`Failed to save: ${res.statusText}`); return; }
      toasts.addToast({ type: 'success', message: 'Artifact updated' });
      onClose();
      onUpdated();
    } catch { setError('Network error'); }
    setLoading(false);
  }, [artifact, title, goal, onClose, onUpdated, toasts]);

  if (!open || !artifact) return null;

  return (
    <VestaraModal onClose={onClose} className="max-w-md">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-(--vestara-text) mb-4">Edit Artifact</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-(--vestara-text-2) block mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Artifact title" autoFocus
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent-border-active) placeholder:(--vestara-text-dim)" />
          </div>
          <div>
            <label className="text-xs text-(--vestara-text-2) block mb-1">Goal</label>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Artifact goal" rows={3}
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent-border-active) placeholder:(--vestara-text-dim) resize-none" />
          </div>
          {error && <p className="text-[10px] text-(--vestara-red)">{error}</p>}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={loading}
              className="text-xs px-4 py-1.5 rounded-lg bg-(--vestara-accent) text-white hover:opacity-90 disabled:opacity-40 cursor-pointer font-medium">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </VestaraModal>
  );
}
