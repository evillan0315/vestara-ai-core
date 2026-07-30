import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && !loading) handleCreate(); }}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-4">Create Artifact</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Goal / Description</label>
            <textarea value={goal} onChange={(e) => { setGoal(e.target.value); setError(''); }} placeholder="Describe the artifact goal..." autoFocus rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 placeholder-zinc-600 resize-none" />
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 cursor-pointer">Cancel</button>
            <button onClick={handleCreate} disabled={loading || !goal.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer font-medium">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
