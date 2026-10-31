import { useState } from 'react';
import type { EffectiveState } from '../../lib/activity';
import type { ActivityScope, AuxiliarySource } from './activity-types';

/**
 * Effective state — the projection of durable history (Direction 2), sourced
 * from the room model (AR-01). Presentation goal: understandable to the
 * Director without record IDs, activity semantics, or the raw stream.
 * "Nothing needs your attention" is a useful positive state, not an empty one.
 * Always derived, never authoritative.
 */
export default function ActivityStatePanel({
  scope,
  source,
  onRetry,
}: {
  scope: ActivityScope;
  source: AuxiliarySource<EffectiveState>;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const state = source.status === 'ready' || source.status === 'stale' ? source.data : undefined;
  const scoped = Boolean(scope.workflowId || scope.sessionId);

  const attentionSummary =
    source.status === 'loading' || source.status === 'idle'
      ? 'Checking attention…'
      : source.status === 'error'
        ? 'Unavailable'
        : state !== undefined && state.needsAttention > 0
          ? `${state.needsAttention} item(s) need your attention`
          : 'Nothing needs your attention';

  // Attention Bar tone: healthy (green), approval (blue), attention (amber),
  // blocked/error (red) — "routine stays quiet, exceptional becomes prominent".
  // Spec §5: approval = execution blue (--vestara-status-info), attention = warning amber.
  const approvals = state?.open.filter((item) => item.effect === 'authorization').length ?? 0;
  const blocked = state?.open.some((item) => item.effect === 'block' || item.effect === 'failure') ?? false;
  const tone =
    source.status === 'loading' || source.status === 'idle'
      ? { label: 'Checking…', icon: '◐', cls: 'border-[var(--vestara-accent-border)] text-[var(--vestara-text-muted)]' }
      : source.status === 'error'
        ? { label: 'Unavailable', icon: '✕', cls: 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]' }
        : source.status === 'stale'
          ? { label: 'Attention stale', icon: '◑', cls: 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]' }
          : state !== undefined && state.needsAttention > 0
            ? blocked
              ? { label: 'Blocked', icon: '⛔', cls: 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]' }
              : approvals > 0
                ? { label: 'Approval required', icon: '●', cls: 'border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)] text-[var(--vestara-status-info)]' }
                : { label: 'Attention required', icon: '⚠', cls: 'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]' }
            : { label: 'Healthy', icon: '✓', cls: 'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]' };

  return (
    <div className={`sticky top-0 z-[var(--vestara-z-index-sticky,1100)] shrink-0 rounded-[var(--vestara-radius-lg)] border px-3 py-2 ${tone.cls}`}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-90">Effective state{scoped ? ' · scoped' : ''}</span>
          <span className="text-[10px] font-medium">
            {tone.icon} {tone.label} — {attentionSummary}
          </span>
        </span>
        <span className="text-[10px] opacity-70">{expanded ? 'Hide' : 'Details'} · derived from history</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {(source.status === 'loading' || source.status === 'idle') && (
            <p className="text-[10px] text-[var(--vestara-text-muted)]">Derived state is being refreshed for this scope.</p>
          )}
          {source.status === 'error' && (
            <p className="flex items-center gap-2 text-[10px] text-[var(--vestara-status-warning)]">
              <span>Derived state is temporarily unavailable. Activity history is still available below.</span>
              <button type="button" onClick={onRetry} className="shrink-0 underline cursor-pointer">
                Retry
              </button>
            </p>
          )}
          {source.status === 'stale' && (
            <p className="flex items-center gap-2 text-[10px] text-[var(--vestara-status-warning)]">
              <span>Showing previously computed state — the latest refresh failed.</span>
              <button type="button" onClick={onRetry} className="shrink-0 underline cursor-pointer">
                Retry
              </button>
            </p>
          )}
          {state !== null && state !== undefined && (
            <>
              {state.corrections.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">Corrections</div>
                  {state.corrections.map((correction) => (
                    <div key={correction.originalId} className="mt-0.5 text-[10px] text-[var(--vestara-text-secondary)]">
                      <span className="text-[var(--vestara-text-muted)]">Corrected:</span>{' '}
                      <span className="text-[var(--vestara-text-primary)]">{truncate(correction.originalContent ?? correction.content ?? correction.originalId)}</span>{' '}
                      — by <span className="font-medium">{correction.correctedBy}</span>
                    </div>
                  ))}
                </div>
              )}

              {state.open.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">Open</div>
                  {state.open.map((item) => (
                    <div key={item.id} className="mt-0.5 text-[10px] text-[var(--vestara-text-secondary)]">
                      <span className="font-medium">{item.effect}</span> · {item.actor}
                      <div className="truncate text-[10px] text-[var(--vestara-text-muted)]">{truncate(item.content)}</div>
                    </div>
                  ))}
                </div>
              )}

              {state.units.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">Workstreams</div>
                  {state.units.slice(0, 4).map((unit) => (
                    <div key={`${unit.workflowId ?? ''}-${unit.sessionId ?? ''}`} className="mt-0.5 text-[10px] text-[var(--vestara-text-secondary)]">
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
