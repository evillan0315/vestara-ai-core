import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';
import { VestaraModal } from '../ui/VestaraModal';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateArtifactModal({ open, onClose, onCreated }: Props) {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toasts = useToasts();

  const handleCreate = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed) { setError('Goal is required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: trimmed }),
      });
      if (!res.ok) { setError(`Failed to create: ${res.statusText}`); return; }
      toasts.addToast({ type: 'success', message: 'Artifact created' });
      setGoal('');
      onClose();
      onCreated();
    } catch { setError('Network error'); }
    setLoading(false);
  }, [goal, onClose, onCreated, toasts]);

  if (!open) return null;

  return (
    <VestaraModal onClose={onClose} className="max-w-md">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-(--vestara-text) mb-4">Create Artifact</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-(--vestara-text-2) block mb-1">Goal / Description</label>
            <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setError(''); }} placeholder="Describe the artifact goal..." autoFocus rows={3}
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent-border-active) placeholder:(--vestara-text-dim) resize-none" />
          </div>
          {error && <p className="text-[10px] text-(--vestara-red)">{error}</p>}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={loading || !goal.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-(--vestara-accent) text-white hover:opacity-90 disabled:opacity-40 cursor-pointer font-medium">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </VestaraModal>
  );
}
