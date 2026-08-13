import { useEffect, useState } from 'react';
import { fetchEffectiveState, type EffectiveState } from '../../lib/activity';
import type { ActivityScope } from './activity-types';

/**
 * Effective state — the projection of durable history (Direction 2).
 * Presentation goal: understandable to the Director without record IDs,
 * activity semantics, or the raw stream. "Nothing needs your attention" is a
 * useful positive state, not an empty one. Always derived, never authoritative.
 */
export default function ActivityStatePanel({ scope }: { scope: ActivityScope }) {
  const [state, setState] = useState<EffectiveState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let disposed = false;
    setState(null);
    setStatus('loading');
    void fetchEffectiveState(scope).then((next) => {
      if (disposed) return;
      setState(next);
      setStatus(next === null ? 'error' : 'ready');
    });
    return () => {
      disposed = true;
    };
  }, [scope]);

  const attentionSummary = status === 'loading' ? 'Checking attention…' : status === 'error' ? 'Unavailable' : state !== null && state.needsAttention > 0
    ? `${state.needsAttention} item(s) need your attention`
    : 'Nothing needs your attention';

  // Attention Bar tone: healthy (green), attention (amber), approval (blue),
  // blocked (red) — "routine stays quiet, exceptional becomes prominent".
  const approvals = state?.open.filter((item) => item.effect === 'authorization').length ?? 0;
  const tone = status === 'loading'
    ? { label: 'Checking…', icon: '◐', cls: 'border-(--vestara-accent-border) text-(--vestara-text-muted)' }
    : status === 'error'
      ? { label: 'Unavailable', icon: '✕', cls: 'border-(--vestara-red)/40 bg-(--vestara-red)/5 text-(--vestara-red)' }
      : state && state.needsAttention > 0
        ? { label: approvals > 0 ? 'Approval required' : 'Attention required', icon: approvals > 0 ? '●' : '⚠', cls: 'border-(--vestara-amber)/40 bg-(--vestara-amber)/5 text-(--vestara-amber)' }
        : { label: 'Healthy', icon: '✓', cls: 'border-(--vestara-green)/40 bg-(--vestara-green)/5 text-(--vestara-green)' };

  return (
    <div className={`shrink-0 rounded-xl border px-3 py-2 ${tone.cls}`}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest opacity-90">Effective state{scope.workflowId || scope.sessionId ? ' · scoped' : ''}</span>
          <span className="text-[10px] font-medium">
            {tone.icon} {tone.label} — {attentionSummary}
          </span>
        </span>
        <span className="text-[9px] opacity-70">{expanded ? 'Hide' : 'Details'} · derived from history</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {status === 'loading' && <p className="text-[10px] text-(--vestara-text-muted)">Derived state is being refreshed for this scope.</p>}
          {status === 'error' && <p className="text-[10px] text-(--vestara-amber)">Derived state is temporarily unavailable. Activity history is still available below.</p>}
          {state !== null && (
            <>
          {state.corrections.length > 0 && (
            <div>
              <div className="text-[8px] uppercase tracking-wider text-(--vestara-text-dim)">Corrections</div>
              {state.corrections.map((correction) => (
                <div key={correction.originalId} className="mt-0.5 text-[10px] text-(--vestara-text-2)">
                  <span className="text-(--vestara-text-dim)">Corrected:</span>{' '}
                  <span className="text-(--vestara-text)">{truncate(correction.originalContent ?? correction.content ?? correction.originalId)}</span>{' '}
                  — by <span className="font-medium">{correction.correctedBy}</span>
                </div>
              ))}
            </div>
          )}

          {state.open.length > 0 && (
            <div>
              <div className="text-[8px] uppercase tracking-wider text-(--vestara-text-dim)">Open</div>
              {state.open.map((item) => (
                <div key={item.id} className="mt-0.5 text-[10px] text-(--vestara-text-2)">
                  <span className="font-medium">{item.effect}</span> · {item.actor}
                  <div className="truncate text-[9px] text-(--vestara-text-muted)">{truncate(item.content)}</div>
                </div>
              ))}
            </div>
          )}

          {state.units.length > 0 && (
            <div>
              <div className="text-[8px] uppercase tracking-wider text-(--vestara-text-dim)">Workstreams</div>
              {state.units.slice(0, 4).map((unit) => (
                <div key={`${unit.workflowId ?? ''}-${unit.sessionId ?? ''}`} className="mt-0.5 text-[10px] text-(--vestara-text-2)">
                  <span className="font-medium">{unit.workflowId ?? unit.sessionId}</span> —{' '}
                  {unit.latestEffect === undefined ? 'no marked state' : `latest: ${unit.latestEffect}`} · {unit.recordCount} events
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
