import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';
import { VestaraModal } from '../ui/VestaraModal';

interface Props {
  open: boolean;
  artifact: { id: string; title?: string; goal?: string; status: string } | null;
  action: 'approve' | 'reject' | null;
  onClose: () => void;
  onCompleted: () => void;
}

export default function ApproveRejectDialog({ open, artifact, action, onClose, onCompleted }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const toasts = useToasts();

  const handleSubmit = useCallback(async () => {
    if (!artifact) return;
    setLoading(true);
    try {
      if (action === 'approve') {
        const res = await fetch(`/api/plans/${artifact.id}/approve`, { method: 'POST' });
        if (!res.ok) { toasts.addToast({ type: 'error', message: 'Approval failed' }); setLoading(false); return; }
        toasts.addToast({ type: 'success', message: 'Artifact approved' });
      } else {
        const res = await fetch('/api/collab/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId: artifact.id, reason: reason.trim() || 'Rejected via dashboard' }),
        });
        if (!res.ok) { toasts.addToast({ type: 'error', message: 'Rejection failed' }); setLoading(false); return; }
        toasts.addToast({ type: 'success', message: 'Artifact rejected' });
      }
      setReason('');
      onClose();
      onCompleted();
    } catch { toasts.addToast({ type: 'error', message: 'Network error' }); }
    setLoading(false);
  }, [artifact, action, reason, onClose, onCompleted, toasts]);

  if (!open || !artifact || !action) return null;

  const isTerminal = artifact.status === 'approved' || artifact.status === 'rejected';

  return (
    <VestaraModal onClose={onClose} className="max-w-sm">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-(--vestara-text) mb-2 capitalize">{action} Artifact</h3>
        <p className="text-xs text-(--vestara-text-2) mb-1">Are you sure you want to <strong className="text-(--vestara-text)">{action}</strong> this artifact?</p>
        <p className="text-xs text-(--vestara-text) font-mono bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded p-2 mb-3">{artifact.title || artifact.goal || artifact.id}</p>

        {isTerminal && <p className="text-[10px] text-(--vestara-amber) mb-2">This artifact is already in a terminal state ({artifact.status}).</p>}

        {action === 'reject' && (
          <div className="mb-3">
            <label className="text-xs text-(--vestara-text-2) block mb-1">Reason (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being rejected?" rows={2} autoFocus
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg p-2 text-xs outline-none focus:border-(--vestara-red) placeholder:(--vestara-text-dim) resize-none" />
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className={`text-xs px-4 py-1.5 rounded-lg font-medium cursor-pointer disabled:opacity-40 ${
              action === 'approve' ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-red-600 text-white hover:bg-red-500'
            }`}>
            {loading ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </VestaraModal>
  );
}
