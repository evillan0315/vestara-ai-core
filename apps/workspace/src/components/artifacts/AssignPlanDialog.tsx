import { useCallback, useEffect, useState } from 'react';
import { useToasts } from '../Toast';

interface Props {
  open: boolean;
  artifact: { id: string; title?: string; goal?: string; status: string } | null;
  plans: Array<{ id: string; title: string; goal: string }>;
  onClose: () => void;
  onAssigned: () => void;
}

export default function AssignPlanDialog({ open, artifact, plans, onClose, onAssigned }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(false);
  const toasts = useToasts();

  useEffect(() => {
    if (open) setSelectedPlanId('');
  }, [open]);

  const handleAssign = useCallback(async () => {
    if (!artifact || !selectedPlanId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plans/${selectedPlanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) { toasts.addToast({ type: 'error', message: 'Assignment failed' }); setLoading(false); return; }
      toasts.addToast({ type: 'success', message: 'Plan assigned' });
      onClose();
      onAssigned();
    } catch { toasts.addToast({ type: 'error', message: 'Network error' }); }
    setLoading(false);
  }, [artifact, selectedPlanId, onClose, onAssigned, toasts]);

  if (!open || !artifact) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Assign Plan</h3>
        <p className="text-xs text-zinc-400 mb-3">Link this artifact to a plan: <span className="text-zinc-300 font-mono">{artifact.title || artifact.goal || artifact.id}</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Select Plan</label>
            <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 cursor-pointer">
              <option value="">-- Select a plan --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.title || p.goal || p.id}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 cursor-pointer">Cancel</button>
            <button onClick={handleAssign} disabled={loading || !selectedPlanId}
              className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 cursor-pointer font-medium">
              {loading ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
