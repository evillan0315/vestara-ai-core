import { useEffect, useState } from 'react';
import { fetchEffectiveState, type EffectiveState } from '../../lib/activity';

/**
 * Effective state — the projection of durable history (Direction 2).
 * Presentation goal: understandable to the Director without record IDs,
 * activity semantics, or the raw stream. "Nothing needs your attention" is a
 * useful positive state, not an empty one. Always derived, never authoritative.
 */
export default function ActivityStatePanel() {
  const [state, setState] = useState<EffectiveState | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let disposed = false;
    void fetchEffectiveState().then((next) => {
      if (!disposed) setState(next);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const attentionSummary = state === null ? 'Computing…' : state.needsAttention > 0
    ? `${state.needsAttention} item(s) need your attention`
    : 'Nothing needs your attention';

  return (
    <div className="shrink-0 rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Effective state</span>
          <span className={`text-[10px] ${state !== null && state.needsAttention > 0 ? 'text-(--vestara-amber)' : 'text-(--vestara-green)'}`}>
            {attentionSummary}
          </span>
        </span>
        <span className="text-[9px] text-(--vestara-text-dim)">{expanded ? 'Hide' : 'Details'} · derived from history</span>
      </button>

      {expanded && state !== null && (
        <div className="mt-2 space-y-1.5">
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
        </div>
      )}
    </div>
  );
}

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
