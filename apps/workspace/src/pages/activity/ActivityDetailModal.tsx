import { useEffect, useState } from 'react';
import { VestaraModal } from '../../components/ui/VestaraModal';
import { MarkdownRenderer } from '../../components/chat/MarkdownRenderer';
import {
  actorInitials,
  effectAccent,
  effectLabel,
  formatRelative,
  kindIcon,
  kindLabel,
  severityAccent,
  severityOfRecord,
} from './activity-formatters';
import type { ActivityProjectionRecord, ActivityRecord } from './activity-types';

interface ActivityDetailModalProps {
  record: ActivityProjectionRecord | null;
  onClose: () => void;
  /** Records available to resolve related/corrected ids to readable titles. */
  records?: readonly ActivityRecord[];
}

/** Resolve an activity id to a short readable title, falling back to the id. */
function resolveTitle(records: readonly ActivityRecord[] | undefined, id: string): string {
  const record = records?.find((entry) => entry.id === id);
  if (!record) return id;
  if (record.kind === 'agent-message') return record.content.slice(0, 60) || id;
  const title =
    (record as { reason?: string; status?: string; outcome?: string }).reason ??
    (record as { status?: string }).status ??
    (record as { outcome?: string }).outcome;
  return title ? `${record.kind} · ${title.slice(0, 60)}` : id;
}

/** The human-readable content line for the record. */
function contentLine(record: ActivityRecord): string {
  switch (record.kind) {
    case 'agent-message':
      return record.content;
    case 'workflow':
      return record.reason || `${record.previousState} → ${record.currentState}`;
    case 'task':
      return record.summary || `Task ${record.status}`;
    case 'verification':
      return record.reason || `Verification ${record.outcome}`;
    case 'test':
      return `${record.passed} passed, ${record.failed} failed`;
    default:
      return record.id;
  }
}

/** Technical rows revealed under "Technical details". */
function technicalRows(record: ActivityRecord): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | number | boolean | undefined | null): void => {
    if (value === undefined || value === null || value === '') return;
    rows.push({ label, value: typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value) });
  };

  push('Actor type', record.actor.type);
  push('Actor role', record.actor.role);
  push('Model', record.actor.modelId);
  push('Provider', record.actor.providerId);
  push('Timestamp', record.timestamp);
  push('Sequence', record.sequence);
  push('Record ID', record.id);
  push('Correlation', record.correlationId);

  switch (record.kind) {
    case 'workflow':
      push('Workflow ID', record.workflowId);
      push('Previous state', record.previousState);
      push('Current state', record.currentState);
      push('Reason', record.reason);
      push('Authoritative', record.authoritative);
      push('Observed', record.observed);
      break;
    case 'task':
      push('Task ID', record.taskId);
      push('Plan', record.planId);
      push('Previous status', record.previousStatus);
      push('Status', record.status);
      push('Summary', record.summary);
      break;
    case 'agent-message':
      push('Agent', record.agentId);
      push('Thread', record.threadId);
      push('Turn', record.turnId);
      push('Message kind', record.messageKind);
      push('Tool', record.toolName);
      push('Risk', record.risk);
      push('Status', record.status);
      push('Content', record.content);
      break;
    case 'verification':
      push('Verification run', record.verificationRunId);
      push('Task', record.taskId);
      push('Outcome', record.outcome);
      push('Confidence', record.confidence);
      push('Reason', record.reason);
      break;
    case 'test':
      push('Task', record.taskId);
      push('Command', record.command);
      push('Passed', record.passed);
      push('Failed', record.failed);
      push('Skipped', record.skipped);
      push('Duration', record.durationMs !== undefined ? `${record.durationMs} ms` : undefined);
      push('Failure fingerprints', record.failureFingerprints.join(', '));
      push('Output excerpt', record.outputExcerpt);
      break;
  }

  return rows;
}

export default function ActivityDetailModal({ record: recordProp, onClose, records }: ActivityDetailModalProps) {
  const [fullRecord, setFullRecord] = useState<ActivityRecord | null>(null);

  // Lazy detail hydration (STREAM-PERF): the list serves truncated projections;
  // when a record is flagged `hasDetails`, fetch the full raw record on demand.
  useEffect(() => {
    if (recordProp === null) {
      setFullRecord(null);
      return;
    }
    if (!recordProp.hasDetails) {
      setFullRecord(recordProp);
      return;
    }
    let disposed = false;
    setFullRecord(null);
    fetch(`/api/activity-room/${encodeURIComponent(recordProp.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (disposed) return;
        setFullRecord(((data as { record?: ActivityRecord })?.record ?? recordProp) as ActivityRecord);
      })
      .catch(() => {
        if (!disposed) setFullRecord(recordProp);
      });
    return () => {
      disposed = true;
    };
  }, [recordProp]);

  useEffect(() => {
    if (recordProp === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recordProp, onClose]);

  if (recordProp === null) return null;
  const record = fullRecord ?? recordProp;
  const loadingDetails = recordProp.hasDetails === true && fullRecord === null;

  const severity = severityOfRecord(record);
  const rows = technicalRows(record);
  const checks = record.kind === 'verification' ? record.checks : undefined;
  const contextParts = [
    record.workflowId && `Workflow ${record.workflowId}`,
    record.sessionId && `Session ${record.sessionId}`,
    record.taskId && `Task ${record.taskId}`,
  ].filter(Boolean);

  return (
    <VestaraModal onClose={onClose} ariaLabel={`${kindLabel(record.kind)} activity details`} className="max-w-2xl">
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-center gap-2 px-6 py-4">
          <span className="text-sm text-(--vestara-text-2)">{kindIcon(record.kind)}</span>
          <h2 className="text-sm font-semibold text-(--vestara-text)">{kindLabel(record.kind)} activity</h2>
          <button
            type="button"
            onClick={onClose}
             className="ml-auto flex h-11 w-11 items-center justify-center rounded-md border border-(--vestara-accent-border) text-xs text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6">
          {/* Human-readable summary first */}
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-[9px] font-semibold text-(--vestara-text-2)">
              {actorInitials(record)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-(--vestara-text)">
                {record.actor.displayName || record.actor.id}
              </div>
              <div className="text-[9px] text-(--vestara-text-dim)">
                {record.actor.role ?? record.actor.type} · {formatRelative(record.timestamp)}
              </div>
            </div>
            {record.effect !== undefined && (
              <span className="ml-auto shrink-0 text-[10px] font-medium" style={{ color: effectAccent(record.effect) }}>
                {effectLabel(record.effect)}
              </span>
            )}
          </div>

          <div className="mt-2 rounded-lg border-l-2 bg-(--vestara-accent-bg) px-3 py-2" style={{ borderLeftColor: severityAccent(severity) }}>
            {loadingDetails && (
              <p className="mb-1 text-[10px] text-(--vestara-text-muted)">Loading full details…</p>
            )}
            <div className="text-[12px] leading-relaxed text-(--vestara-text)">
              <MarkdownRenderer content={contentLine(record)} />
            </div>
            {contextParts.length > 0 && (
              <div className="mt-1 text-[9px] text-(--vestara-text-dim)">{contextParts.join(' · ')}</div>
            )}
          </div>

          {record.correctionOf !== undefined && (
            <div className="mt-3">
              <h3 className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Correction of</h3>
              <div className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] text-(--vestara-text-2)">
                {resolveTitle(records, record.correctionOf)}
              </div>
            </div>
          )}

          {record.relatesTo !== undefined && record.relatesTo.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Related activity</h3>
              <div className="flex flex-wrap gap-1.5">
                {record.relatesTo.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-0.5 text-[9px] text-(--vestara-text-2)"
                    title={id}
                  >
                    {resolveTitle(records, id)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Technical details — collapsed by default */}
          <details className="mt-3 rounded-lg border border-(--vestara-accent-border)">
            <summary className="cursor-pointer select-none px-3 py-2 text-[9px] uppercase tracking-widest text-(--vestara-text-2)">
              Technical details
            </summary>
            <div className="space-y-1.5 px-3 pb-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[130px_1fr] gap-3 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5"
                >
                  <span className="break-words text-[9px] uppercase tracking-wider text-(--vestara-text-dim)">
                    {row.label}
                  </span>
                  <span className="break-words text-[10px] leading-relaxed text-(--vestara-text-2)">{row.value}</span>
                </div>
              ))}

              {checks !== undefined && checks.length > 0 && (
                <section className="mt-2">
                  <h3 className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">
                    Verification checks
                  </h3>
                  {checks.map((check) => (
                    <div
                      key={check.name}
                      className="grid grid-cols-[120px_90px_1fr] gap-3 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5"
                    >
                      <span className="break-words text-[10px] text-(--vestara-text-2)">{check.name}</span>
                      <span className="text-[9px] text-(--vestara-text-dim)">{check.status}</span>
                      {check.summary && (
                        <span className="break-words text-[10px] text-(--vestara-text-muted)">{check.summary}</span>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {record.evidenceRefs.length > 0 && (
                <section className="mt-2">
                  <h3 className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">
                    Evidence references
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {record.evidenceRefs.map((ref) => (
                      <span
                        key={ref}
                        className="rounded-md border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-0.5 font-mono text-[9px] text-(--vestara-text-2)"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <details className="mt-2 rounded-lg border border-(--vestara-accent-border)">
                <summary className="cursor-pointer select-none px-2 py-1.5 text-[9px] uppercase tracking-widest text-(--vestara-text-2)">
                  Raw payload
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[10px] leading-relaxed text-(--vestara-text-muted)">
                  {JSON.stringify(record, null, 2)}
                </pre>
              </details>
            </div>
          </details>
        </div>
      </div>
    </VestaraModal>
  );
}
