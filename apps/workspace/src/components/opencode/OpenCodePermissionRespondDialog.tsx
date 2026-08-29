import { useState } from 'react';
import type {
  OpenCodePermissionDecision,
  OpenCodePermissionRequest,
  OpenCodePermissionScope,
} from '../../lib/opencode';
import { permissionResourceSummary } from '../../lib/opencode';
import { OpenCodePermissionRiskBadge } from './OpenCodePermissionRiskBadge';

interface OpenCodePermissionRespondDialogProps {
  request: OpenCodePermissionRequest;
  pending: boolean;
  error?: string | null;
  onRespond: (decision: OpenCodePermissionDecision, scope: OpenCodePermissionScope) => void;
  onCancel: () => void;
}

export function OpenCodePermissionRespondDialog({
  request,
  pending,
  error,
  onRespond,
  onCancel,
}: OpenCodePermissionRespondDialogProps) {
  const [decision, setDecision] = useState<OpenCodePermissionDecision>('approve');
  const [scope, setScope] = useState<OpenCodePermissionScope>('once');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Respond to permission request"
    >
      <div className="w-full max-w-sm mx-4 p-4 bg-zinc-900 border border-(--vestara-accent-border) rounded-lg">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-(--vestara-text)">Permission request</h3>
          <OpenCodePermissionRiskBadge risk={request.risk} />
        </div>
        <p className="text-[11px] text-(--vestara-text-muted) mt-2">
          <span className="font-mono text-(--vestara-accent)">{request.action}</span>{' '}
          <span className="font-mono">{permissionResourceSummary(request)}</span>
        </p>
        <p className="text-[10px] font-mono text-(--vestara-text-dim) mt-1">{request.id}</p>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) cursor-pointer">
            <input
              type="radio"
              name="decision"
              checked={decision === 'approve'}
              onChange={() => setDecision('approve')}
              className="accent-(--vestara-accent)"
            />
            Approve
          </label>
          <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) cursor-pointer">
            <input
              type="radio"
              name="decision"
              checked={decision === 'reject'}
              onChange={() => setDecision('reject')}
              className="accent-(--vestara-accent)"
            />
            Reject
          </label>
        </div>

        {decision === 'approve' && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={scope === 'once'}
                onChange={() => setScope('once')}
                className="accent-(--vestara-accent)"
              />
              Once
            </label>
            <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={scope === 'session'}
                onChange={() => setScope('session')}
                className="accent-(--vestara-accent)"
              />
              For this session
            </label>
          </div>
        )}

        {error && <p className="text-[10px] text-(--vestara-red) mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[10px] px-2.5 py-1.5 rounded-md border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRespond(decision, decision === 'approve' ? scope : 'once')}
            disabled={pending}
            className={`text-[10px] px-2.5 py-1.5 rounded-md border cursor-pointer disabled:opacity-40 ${
              decision === 'approve'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:text-emerald-300'
                : 'bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300'
            }`}
          >
            {pending ? 'Responding…' : decision === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
