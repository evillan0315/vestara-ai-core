import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type OpenCodePermissionDecision,
  type OpenCodePermissionRequest,
  type OpenCodePermissionRisk,
  type OpenCodePermissionScope,
  openCodeApi,
  permissionResourceSummary,
} from '../../lib/opencode';
import { OpenCodePermissionRespondDialog } from './OpenCodePermissionRespondDialog';
import { OpenCodePermissionRiskBadge } from './OpenCodePermissionRiskBadge';

type RiskFilter = 'all' | OpenCodePermissionRisk;
type ViewState = 'loading' | 'ready' | 'offline';

const FILTERS: Array<{ id: RiskFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'dangerous', label: 'Dangerous' },
  { id: 'sensitive', label: 'Sensitive' },
  { id: 'safe', label: 'Safe' },
];

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function OpenCodePermissionsPage() {
  const [requests, setRequests] = useState<OpenCodePermissionRequest[] | null>(null);
  const [view, setView] = useState<ViewState>('loading');
  const [filter, setFilter] = useState<RiskFilter>('all');
  const [selected, setSelected] = useState<OpenCodePermissionRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await openCodeApi.permissions();
    if (result !== null) {
      setRequests(result);
      setView('ready');
    } else {
      setView('offline');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (requests ?? []).filter((request) => filter === 'all' || request.risk === filter),
    [requests, filter],
  );

  const handleRespond = async (decision: OpenCodePermissionDecision, scope: OpenCodePermissionScope) => {
    if (!selected) return;
    setPending(true);
    setRespondError(null);
    const ok = await openCodeApi.respondToPermission(selected.sessionId ?? '', selected.id, decision, scope);
    setPending(false);
    if (ok) {
      setRequests((prev) => prev?.filter((request) => request.id !== selected.id) ?? null);
      setSelected(null);
    } else {
      setRespondError('Respond failed. The request may have already been resolved.');
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">OpenCode Permissions</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Governed permission requests from OpenCode sessions awaiting a Vestara decision
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
        >
          <RefreshRoundedIcon fontSize="inherit" /> Refresh
        </button>
      </div>

      {view === 'loading' && (
        <div className="p-6 text-center text-[11px] text-(--vestara-text-muted) animate-pulse">
          Loading permissions…
        </div>
      )}

      {view === 'offline' && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="text-[12px] font-medium text-red-400">OpenCode is unreachable</div>
          <p className="text-[11px] text-(--vestara-text-muted) mt-0.5">
            Permission requests cannot be listed while the governed runtime is offline.
          </p>
          <button
            type="button"
            onClick={() => {
              setView('loading');
              void load();
            }}
            className="mt-2 text-[10px] px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 hover:text-red-300 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {view === 'ready' && (
        <>
          <div className="flex gap-1 mb-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-[10px] px-2 py-1.5 rounded transition-colors cursor-pointer ${
                  filter === f.id
                    ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)'
                    : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {!requests || requests.length === 0 ? (
            <div className="p-6 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
              <p className="text-[12px] text-(--vestara-text-muted)">No pending permission requests.</p>
              <p className="text-[10px] text-(--vestara-text-dim) mt-1">
                Permission asks surface here when OpenCode needs a Vestara decision.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-[11px] text-(--vestara-text-muted)">No requests match the current filter.</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((request) => (
                <div
                  key={request.id}
                  className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <OpenCodePermissionRiskBadge risk={request.risk} />
                    <span className="text-[12px] font-mono text-(--vestara-accent)">{request.action}</span>
                    <span className="text-[11px] font-mono text-(--vestara-text-2) truncate flex-1 min-w-0">
                      {permissionResourceSummary(request)}
                    </span>
                    <span className="text-[9px] text-(--vestara-text-dim) shrink-0">{timeAgo(request.askedAt)}</span>
                  </div>
                  {request.sessionId && (
                    <div className="text-[9px] font-mono text-(--vestara-text-dim) mt-1">{request.sessionId}</div>
                  )}
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRespondError(null);
                        setSelected(request);
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-md bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
                    >
                      Respond
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <OpenCodePermissionRespondDialog
          request={selected}
          pending={pending}
          error={respondError}
          onRespond={(decision, scope) => void handleRespond(decision, scope)}
          onCancel={() => {
            setSelected(null);
            setRespondError(null);
          }}
        />
      )}
    </div>
  );
}
