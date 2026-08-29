/**
 * Per-session normalized timeline.
 *
 * Renders the timeline returned by GET /api/external-runtime/sessions/:id/
 * timeline. Consumed events from the Engineering Event Store, session detail
 * arrays, and the immutable runtime snapshot are normalized into a single
 * sequence. Noisy events are collapsed; meaningful transitions are promoted;
 * observed vs inferred data are visually distinct; entity chips deep-link to
 * the Inspector.
 */

import { useEffect, useMemo, useState } from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { usePolling } from '../../hooks/usePolling';
import { externalRuntimeApi, type ExternalSessionSummary, type SessionRuntimeSnapshot, type TimelineItem } from '../../lib/external-runtime';
import { openInspector } from './inspector';

const OBSERVATION_STYLE: Record<string, string> = {
  observed: 'text-(--vestara-green) border-(--vestara-green)/40',
  inferred: 'text-(--vestara-amber) border-(--vestara-amber)/40',
  reported: 'text-(--vestara-blue) border-(--vestara-blue)/40',
  partial: 'text-(--vestara-text-muted) border-(--vestara-accent-border)',
};

const OBSERVATION_LABEL: Record<string, string> = {
  observed: 'observed',
  inferred: 'inferred',
  reported: 'reported',
  partial: 'partial',
};

export function SessionTimeline({ session }: { session: ExternalSessionSummary }) {
  const poll = usePolling(() => externalRuntimeApi.sessionTimeline(session.id), 8000);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noisyOpen, setNoisyOpen] = useState(false);
  const items = poll.data?.items ?? [];
  const snapshot = poll.data?.snapshot ?? null;

  const { promoted, noisy } = useMemo(() => {
    const p: TimelineItem[] = [];
    const n: TimelineItem[] = [];
    for (const item of items) {
      if (item.noisy) n.push(item);
      else p.push(item);
    }
    return { promoted: p, noisy: n };
  }, [items]);

  const rendered = useMemo(() => {
    const seen = new Set<string>();
    const unique = [...promoted, ...(noisyOpen ? noisy : noisy.slice(0, 4).map((item) => ({ ...item, collapsed: true })))];
    return unique.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [promoted, noisy, noisyOpen]);

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <SessionHeader session={session} snapshot={snapshot} />
      {items.length === 0 && (
        <p className="text-[11px] text-(--vestara-text-muted) mt-2">
          No timeline events recorded for this session yet — only summary data is available. Events appear as they are observed.
        </p>
      )}
      <div className="mt-2 space-y-1">
        {rendered.map((item) => (
          <TimelineRow key={item.id} item={item} expanded={expanded === item.id} onToggle={() => setExpanded(expanded === item.id ? null : item.id)} />
        ))}
      </div>
      {noisy.length > 4 && !noisyOpen && (
        <button
          type="button"
          onClick={() => setNoisyOpen(true)}
          className="mt-2 flex items-center gap-1 text-[10px] text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer"
        >
          <ExpandMoreRoundedIcon fontSize="inherit" /> Show {noisy.length} collapsed noisy events
        </button>
      )}
      {noisyOpen && noisy.length > 4 && (
        <button type="button" onClick={() => setNoisyOpen(false)} className="mt-2 text-[10px] text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer">
          Collapse noisy events
        </button>
      )}
      {items.length > 0 && poll.data?.sources && <SourceBreakdown sources={poll.data.sources} />}
    </div>
  );
}

function SessionHeader({ session, snapshot }: { session: ExternalSessionSummary; snapshot: SessionRuntimeSnapshot | null }) {
  return (
    <div className="mb-2 pb-2 border-b border-zinc-800">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-(--vestara-text)">{session.title || session.externalSessionId}</span>
        <span className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted)">{session.runtimeType}</span>
        <span className="text-[9px] text-(--vestara-text-muted)">· {session.status}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-1 text-[10px] text-(--vestara-text-muted)">
        <ScheduleRoundedIcon fontSize="inherit" />
        <span>{session.startedAt ? new Date(session.startedAt).toLocaleString() : 'start unknown'}</span>
        {snapshot?.agentId && <span>· agent <button type="button" className="underline decoration-dotted hover:text-(--vestara-text) cursor-pointer" onClick={() => openInspector(entityForAgent(snapshot))}>{snapshot.agentId}</button></span>}
        {snapshot?.modelId && <span>· model <span className="font-mono">{snapshot.modelId}</span></span>}
        {snapshot?.providerId && <span>· provider {snapshot.providerId}</span>}
      </div>
      {snapshot && (
        <div className="mt-1 text-[9px] text-(--vestara-text-muted) font-mono">
          config {snapshot.effectiveConfigurationHash.slice(0, 12)}… · observed {new Date(snapshot.observedAt).toLocaleString()} · {snapshot.provenance}
        </div>
      )}
    </div>
  );
}

function entityForAgent(snapshot: SessionRuntimeSnapshot): string {
  return `agent://external/${snapshot.runtimeInstanceId}/${snapshot.agentId}`;
}

function TimelineRow({ item, expanded, onToggle }: { item: TimelineItem; expanded: boolean; onToggle: () => void }) {
  const hasPayload = item.payload !== undefined && Object.keys(item.payload).length > 0;
  const style = OBSERVATION_STYLE[item.observationLevel] ?? OBSERVATION_STYLE.partial;
  return (
    <div className={`border rounded-lg p-2 ${item.promoted ? 'border-(--vestara-accent-border-active)/50 bg-(--vestara-accent-bg)' : 'border-zinc-800'}`}>
      <button type="button" onClick={onToggle} className="w-full text-left flex items-start gap-2 cursor-pointer">
        <span className="text-[9px] font-mono text-(--vestara-text-muted) mt-0.5 shrink-0">{new Date(item.at).toLocaleTimeString()}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] ${item.promoted ? 'text-(--vestara-text) font-medium' : 'text-(--vestara-text-2)'}`}>{item.label}</span>
            <span className={`text-[8px] uppercase tracking-wider px-1 py-0.5 rounded border ${style}`}>{OBSERVATION_LABEL[item.observationLevel] ?? item.observationLevel}</span>
            <span className="text-[8px] text-(--vestara-text-muted)">{item.kind}</span>
          </div>
          {item.entityIds.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {item.entityIds.slice(0, 4).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openInspector(id);
                  }}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted) hover:text-(--vestara-text) hover:border hover:border-(--vestara-accent-border-active) cursor-pointer"
                  title="Open in Inspector"
                >
                  {id.slice(0, 60)}
                </button>
              ))}
            </div>
          )}
        </div>
      </button>
      {hasPayload && expanded && (
        <pre className="mt-1 text-[9px] font-mono text-(--vestara-text-muted) bg-black/40 rounded p-2 overflow-auto max-h-40">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SourceBreakdown({ sources }: { sources: Record<string, number> }) {
  const labels: Record<string, string> = {
    eventStore: 'event store',
    sessionDetail: 'session detail',
    snapshot: 'runtime snapshot',
  };
  const entries = Object.entries(sources).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 text-[9px] text-(--vestara-text-muted) flex items-center gap-2 flex-wrap">
      sources:
      {entries.map(([key, count]) => (
        <span key={key} className="px-1 py-0.5 rounded bg-zinc-800">
          {labels[key] ?? key}: {count}
        </span>
      ))}
    </div>
  );
}
