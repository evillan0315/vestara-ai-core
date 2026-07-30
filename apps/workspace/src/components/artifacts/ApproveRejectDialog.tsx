import { useCallback, useState } from 'react';
import { useToasts } from '../Toast';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3 className="text-sm font-semibold text-zinc-200 mb-2 capitalize">{action} Artifact</h3>
        <p className="text-xs text-zinc-400 mb-1">Are you sure you want to <strong className="text-zinc-300">{action}</strong> this artifact?</p>
        <p className="text-xs text-zinc-300 font-mono bg-zinc-800 rounded p-2 mb-3">{artifact.title || artifact.goal || artifact.id}</p>

        {isTerminal && <p className="text-[10px] text-amber-400 mb-2">This artifact is already in a terminal state ({artifact.status}).</p>}

        {action === 'reject' && (
          <div className="mb-3">
            <label className="text-xs text-zinc-400 block mb-1">Reason (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being rejected?" rows={2} autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg p-2 text-xs outline-none focus:border-red-500 placeholder-zinc-600 resize-none" />
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className={`text-xs px-4 py-1.5 rounded-lg font-medium cursor-pointer disabled:opacity-40 ${
              action === 'approve' ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-red-600 text-white hover:bg-red-500'
            }`}>
            {loading ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
