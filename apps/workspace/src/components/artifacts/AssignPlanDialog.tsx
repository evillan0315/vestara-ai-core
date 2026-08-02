import { useCallback, useEffect, useState } from 'react';
import { useToasts } from '../Toast';
import { VestaraModal } from '../ui/VestaraModal';

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
    <VestaraModal onClose={onClose} className="max-w-md">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-(--vestara-text) mb-2">Assign Plan</h3>
        <p className="text-xs text-(--vestara-text-2) mb-3">Link this artifact to a plan: <span className="text-(--vestara-text) font-mono">{artifact.title || artifact.goal || artifact.id}</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-(--vestara-text-2) block mb-1">Select Plan</label>
            <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} autoFocus
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-accent-border-active) cursor-pointer">
              <option value="">-- Select a plan --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.title || p.goal || p.id}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">Cancel</button>
            <button onClick={handleAssign} disabled={loading || !selectedPlanId}
              className="text-xs px-4 py-1.5 rounded-lg bg-(--vestara-accent) text-white hover:opacity-90 disabled:opacity-40 cursor-pointer font-medium">
              {loading ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </VestaraModal>
  );
}
