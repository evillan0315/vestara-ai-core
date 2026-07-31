/**
 * Artifacts + Approvals tabs.
 */

import { formatTime, tone } from '../../lib/execution';
import { useExecution } from './ExecutionContext';

function toneClass(t: string): string {
  return t === 'pass'
    ? 'exec-status-pass'
    : t === 'fail'
      ? 'exec-status-fail'
      : t === 'warn'
        ? 'exec-status-warn'
        : 'exec-status-unknown';
}

export function ArtifactsPanel() {
  const { dashboard, search } = useExecution();
  const changeSets = dashboard?.changeSets ?? [];
  const verifications = dashboard?.verifications ?? [];
  const collaboration = dashboard?.collaboration ?? [];

  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const csFiltered = changeSets.filter(
    (c) => match(String((c as any).id ?? '')) || match(String((c as any).planId ?? '')),
  );
  const vFiltered = verifications.filter(
    (v) => match(String((v as any).id ?? '')) || match(String((v as any).status ?? '')),
  );

  return (
    <div className="space-y-3">
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">
          Change Sets <span className="text-zinc-500">{csFiltered.length}</span>
        </div>
        {csFiltered.length === 0 && <p className="exec-empty">No change sets</p>}
        <div className="space-y-1">
          {csFiltered.map((cs) => {
            const c = cs as { id: string; planId?: string; status?: string; createdAt?: string; files?: string[] };
            return (
              <div key={c.id} className="exec-row">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-zinc-300">{c.id}</span>
                  <span className={`exec-status-chip ${toneClass(tone(c.status))}`}>{c.status ?? '—'}</span>
                  <span className="ml-auto text-[10px] text-zinc-500">
                    {c.createdAt ? formatTime(c.createdAt) : ''}
                  </span>
                </div>
                {c.files && c.files.length > 0 && (
                  <div className="text-[10px] text-zinc-600 font-mono truncate mt-0.5">
                    {c.files
                      .slice(0, 5)
                      .map((f) => (typeof f === 'string' ? f : ((f as { path?: string })?.path ?? '')))
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">
          Verification Reports <span className="text-zinc-500">{vFiltered.length}</span>
        </div>
        {vFiltered.length === 0 && <p className="exec-empty">No verification reports</p>}
        <div className="space-y-1">
          {vFiltered.map((v) => {
            const r = v as {
              id: string;
              status?: string;
              createdAt?: string;
              summary?: { total?: number; passed?: number };
            };
            return (
              <div key={r.id} className="exec-row flex items-center gap-2">
                <span className="font-mono text-[11px] text-zinc-300">{r.id}</span>
                <span className={`exec-status-chip ${toneClass(tone(r.status))}`}>{r.status ?? '—'}</span>
                <span className="text-[10.5px] text-zinc-500 ml-auto">
                  {r.summary ? `${r.summary.passed}/${r.summary.total} checks` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">
          Reviews <span className="text-zinc-500">{collaboration.length}</span>
        </div>
        {collaboration.length === 0 && <p className="exec-empty">No collaboration records</p>}
        <div className="space-y-1">
          {collaboration.map((r) => {
            const c = r as { id: string; status?: string; planId?: string; changeSetId?: string };
            return (
              <div key={c.id} className="exec-row flex items-center gap-2">
                <span className={`exec-status-chip ${toneClass(tone(c.status))}`}>{c.status ?? '—'}</span>
                <span className="text-[11px] text-zinc-400 font-mono truncate">{c.changeSetId}</span>
                <span className="ml-auto text-[10px] text-zinc-600">{c.planId}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ApprovalsPanel() {
  const { dashboard } = useExecution();
  const approvals = dashboard?.approvals ?? [];

  return (
    <div className="exec-card exec-card-body">
      <div className="exec-section-title">
        Pending Approvals <span className="text-zinc-500">{approvals.length}</span>
      </div>
      {approvals.length === 0 && (
        <p className="exec-empty">No pending approvals. Everything awaiting review is clear.</p>
      )}
      <div className="space-y-1">
        {approvals.map((a) => (
          <div key={a.id} className="exec-row">
            <div className="flex items-center gap-2">
              <span className={`exec-status-chip ${toneClass(tone(a.status))}`}>{a.status}</span>
              <span className="text-[12px] text-zinc-100 truncate">{a.title}</span>
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              requested by {a.requestedBy} · {formatTime(a.createdAt)}
              {a.risk ? ` · risk ${a.risk}` : ''}
              {a.detail ? ` · ${a.detail}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
