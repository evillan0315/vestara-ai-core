/**
 * HarnessThreadTimeline — durable harness thread items for an ExecutionSession
 * linked to a harness thread (session.workflowId === "thread:<id>").
 *
 * Renders the authoritative thread replay (model responses, tool calls,
 * approvals, verification, final outcome) so the Execution Center shows the
 * complete harness timeline rather than only session summary fields.
 */

import { useEffect, useState } from 'react';
import { harnessApi, type EngineeringTruthEvent, type ThreadItem, type ThreadReplay } from '../../lib/agent-harness';

const KIND_LABEL: Record<string, string> = {
  'harness-run': 'Run started',
  'user-message': 'User message',
  'steering-message': 'Steering',
  'agent-message': 'Agent message',
  'model-response': 'Model response',
  'tool-call': 'Tool call',
  'tool-result': 'Tool result',
  'approval-request': 'Approval requested',
  'approval-decision': 'Approval decision',
  'verification-result': 'Verification',
  'state-transition': 'State transition',
  'final-outcome': 'Final outcome',
};

function itemTitle(item: ThreadItem): string {
  const label = KIND_LABEL[item.kind] ?? item.kind;
  const p = item.payload;
  const detail =
    typeof p.toolName === 'string'
      ? ` ${p.toolName}`
      : typeof p.state === 'string'
        ? ` → ${p.state}`
        : typeof p.status === 'string'
          ? ` (${p.status})`
          : typeof p.decision === 'string'
            ? ` ${p.decision}`
            : '';
  return `${label}${detail}`;
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('deny')) return 'text-(--vestara-red)';
  if (s.includes('approv') || s.includes('pending')) return 'text-(--vestara-amber)';
  if (s.includes('complet') || s.includes('pass') || s.includes('ok')) return 'text-(--vestara-green)';
  return 'text-(--vestara-text-muted)';
}

function ChangeProjection({ events }: { events: EngineeringTruthEvent[] }) {
  const summary = [...events].reverse().find((event) => event.type === 'change.summary.updated');
  const diff = [...events].reverse().find((event) => event.type === 'change.diff.updated');
  const fileEvents = events.filter((event) => event.type.startsWith('change.file.'));
  if (!summary && !diff && fileEvents.length === 0) return null;

  return (
    <div className="mb-2 p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-lg">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">
        Change Projection
        {summary && <span className="normal-case tracking-normal">· {String(summary.payload.summary ?? '')}</span>}
      </div>
      {fileEvents.length > 0 && (
        <div className="space-y-0.5 mb-1">
          {fileEvents.slice(-10).map((event) => {
            const payload = event.payload as { path?: unknown; operation?: unknown; additions?: unknown; deletions?: unknown };
            const op = String(payload.operation ?? event.type.split('.').pop() ?? '');
            const tone = op === 'deleted' ? 'text-(--vestara-red)' : op === 'created' ? 'text-(--vestara-green)' : 'text-(--vestara-amber)';
            const counts =
              op === 'deleted'
                ? ''
                : ` +${Number(payload.additions ?? 0)} -${Number(payload.deletions ?? 0)}`;
            return (
              <div key={event.id} className="text-[10px] font-mono text-(--vestara-text-2)">
                <span className={tone}>{op}</span> {String(payload.path ?? '')}
                <span className="text-(--vestara-text-dim)">{counts}</span>
              </div>
            );
          })}
        </div>
      )}
      {diff && typeof diff.payload.diff === 'string' && diff.payload.diff.length > 0 && (
        <pre className="text-[9px] font-mono text-(--vestara-text-muted) overflow-auto max-h-40">
          {String(diff.payload.diff).slice(0, 2400)}
        </pre>
      )}
    </div>
  );
}

export function HarnessThreadTimeline({ threadId }: { threadId: string }) {
  const [replay, setReplay] = useState<ThreadReplay | null>(null);
  const [changes, setChanges] = useState<EngineeringTruthEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    setChanges([]);
    void harnessApi.items(threadId).then((data) => {
      if (!cancelled && data) setReplay(data);
    });
    void harnessApi.events(threadId).then((data) => {
      if (!cancelled && data) setChanges(data.events.filter((event) => event.type.startsWith('change.')));
    });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!replay) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading harness thread…</p>;
  if (replay.items.length === 0) return <p className="text-[11px] text-(--vestara-text-muted)">No harness items yet.</p>;

  const outcome = replay.turns.at(-1)?.outcome;

  return (
    <div className="mt-2 p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">
        Harness Thread
        <span className="text-(--vestara-text-dim) normal-case tracking-normal">· {replay.items.length} items · {replay.turns.at(-1)?.state}</span>
      </div>
      {outcome && (
        <div className="text-[10px] text-(--vestara-text-2) mb-2">
          Outcome: <span className={statusTone(outcome.state)}>{outcome.state}</span> — {outcome.summary}
        </div>
      )}
      <ChangeProjection events={changes} />
      <div className="space-y-0.5 max-h-[40vh] overflow-auto">
        {replay.items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 border-b border-(--vestara-accent-border)/50 py-1">
            <span className="text-[9px] font-mono text-(--vestara-text-dim) mt-0.5 w-16 shrink-0">{new Date(item.createdAt).toLocaleTimeString()}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-(--vestara-text-2)">{itemTitle(item)}</div>
              {(item.kind === 'tool-call' || item.kind === 'tool-result' || item.kind === 'approval-request') && (
                <button
                  type="button"
                  className="text-[9px] text-(--vestara-text-muted) underline decoration-dotted hover:text-(--vestara-text) cursor-pointer"
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                >
                  {expanded === item.id ? 'collapse' : 'details'}
                </button>
              )}
              {expanded === item.id && (
                <pre className="text-[9px] font-mono text-(--vestara-text-muted) bg-black/40 rounded p-2 overflow-auto max-h-32 mt-1">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
