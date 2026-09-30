/**
 * ActivityDetailDrawer — activity inspection inside the reusable Drawer shell.
 *
 * Replaces the former ActivityDetailModal so the Activity Room stays visible
 * while inspecting an activity. Shell behavior (position, sizing, resize,
 * Escape, overlay close, responsive) is owned entirely by `Drawer` — the
 * same shell used by AgentDetailDrawer — and this file adds only the
 * Activity-specific presentation.
 *
 * Content is strictly record-stamped data/provenance: summary, actor,
 * kind context, correction/related links, and technical details. Fields
 * that are absent stay absent (UNKNOWN is preserved, never inferred).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { MarkdownRenderer } from '../../components/chat/MarkdownRenderer';
import { WorkspaceOperationalPanel } from '../../components/WorkspaceOperationalPanel';
import { navIcon } from '../../layouts/workspace-navigation';
import './ActivityDetailDrawer.css';
import {
  actorInitials,
  effectAccent,
  effectLabel,
  formatRelative,
  kindIcon,
  kindLabel,
  severityBadge,
  severityOfRecord,
} from './activity-formatters';
import type { ActivityProjectionRecord, ActivityRecord } from './activity-types';

interface ActivityDetailDrawerProps {
  record: ActivityProjectionRecord | null;
  onClose: () => void;
  /** Records available to resolve related/corrected ids to readable titles. */
  records?: readonly ActivityRecord[];
}

type ActivityDetailTab = 'overview' | 'operations' | 'evidence' | 'raw';

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
    case 'tool-call':
      return `${record.toolName} started`;
    case 'tool-result':
      return `${record.toolName} ${record.status}`;
    default:
      return record.id;
  }
}

function displayType(record: ActivityRecord): string {
  if (record.kind === 'agent-message' && record.messageKind === 'approval-request') return 'APPROVAL';
  if (record.kind === 'agent-message' && record.messageKind === 'approval-decision') return 'APPROVAL';
  if (record.kind === 'agent-message') return 'MESSAGE';
  if (record.kind === 'tool-call' || record.kind === 'tool-result') return 'TOOL';
  return kindLabel(record.kind).toUpperCase();
}

function statusForRecord(record: ActivityRecord): string | undefined {
  switch (record.kind) {
    case 'workflow':
      return record.currentState;
    case 'task':
      return record.status;
    case 'tool-call':
      return 'running';
    case 'tool-result':
      return record.status;
    case 'verification':
      return record.outcome;
    case 'test':
      return record.failed > 0 ? 'failed' : record.passed > 0 ? 'passed' : undefined;
    case 'agent-message':
      return record.status;
    default:
      return undefined;
  }
}

function FieldGrid({ rows }: { rows: Array<{ label: string; value: string | number | boolean | undefined }> }) {
  const visible = rows.filter((row) => row.value !== undefined && row.value !== '');
  if (visible.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {visible.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[130px_1fr] gap-3 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5"
        >
          <span className="break-words text-[9px] uppercase tracking-wider text-(--vestara-text-dim)">
            {row.label}
          </span>
          <span className="break-words text-[10px] leading-relaxed text-(--vestara-text-2)">
            {typeof row.value === 'boolean' ? (row.value ? 'yes' : 'no') : row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">{title}</h3>
      {children}
    </section>
  );
}

function ResultBlock({ value }: { value: string | undefined }) {
  if (!value) return null;
  const formatted = (() => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  })();
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-3 font-mono text-[10px] leading-relaxed text-(--vestara-text-2)">
      {formatted}
    </pre>
  );
}

function renderPrimaryDetails(record: ActivityRecord) {
  switch (record.kind) {
    case 'tool-call':
      return (
        <>
          <DetailSection title="Tool">
            <FieldGrid rows={[
              { label: 'Tool', value: record.toolName },
              { label: 'Status', value: 'running' },
              { label: 'Call ID', value: record.callID },
            ]} />
          </DetailSection>
          {record.output && (
            <DetailSection title="Invocation / Input">
              <ResultBlock value={record.output} />
            </DetailSection>
          )}
        </>
      );
    case 'tool-result':
      return (
        <>
          <DetailSection title="Tool">
            <FieldGrid rows={[
              { label: 'Tool', value: record.toolName },
              { label: 'Status', value: record.status },
              { label: 'Call ID', value: record.callID },
            ]} />
          </DetailSection>
          {record.output && (
            <DetailSection title={record.status === 'failed' ? 'Error' : 'Result'}>
              <ResultBlock value={record.output} />
            </DetailSection>
          )}
        </>
      );
    case 'workflow':
      return (
        <DetailSection title="Workflow">
          <FieldGrid rows={[
            { label: 'Workflow', value: record.workflowId },
            { label: 'Previous state', value: record.previousState },
            { label: 'Current state', value: record.currentState },
            { label: 'Reason', value: record.reason },
            { label: 'Authoritative', value: record.authoritative },
            { label: 'Observed', value: record.observed },
          ]} />
        </DetailSection>
      );
    case 'task':
      return (
        <DetailSection title="Task">
          <FieldGrid rows={[
            { label: 'Task', value: record.taskId },
            { label: 'Status', value: record.status },
            { label: 'Summary', value: record.summary },
            { label: 'Workflow', value: record.workflowId },
            { label: 'Plan', value: record.planId },
            { label: 'Previous status', value: record.previousStatus },
          ]} />
        </DetailSection>
      );
    case 'verification':
      return (
        <>
          <DetailSection title="Verification">
            <FieldGrid rows={[
              { label: 'Outcome', value: record.outcome },
              { label: 'Reason', value: record.reason },
              { label: 'Checks', value: `${record.checks.filter((check) => check.status === 'passed').length} passed · ${record.checks.filter((check) => check.status === 'failed').length} failed · ${record.checks.filter((check) => check.status === 'blocked').length} blocked` },
              { label: 'Task', value: record.taskId },
              { label: 'Run', value: record.verificationRunId },
            ]} />
          </DetailSection>
          {record.checks.length > 0 && (
            <DetailSection title="Checks">
              <FieldGrid rows={record.checks.map((check) => ({
                label: check.name,
                value: check.summary ? `${check.status} · ${check.summary}` : check.status,
              }))} />
            </DetailSection>
          )}
        </>
      );
    case 'test':
      return (
        <>
          <DetailSection title="Test">
            <FieldGrid rows={[
              { label: 'Command', value: record.command },
              { label: 'Outcome', value: record.failed > 0 ? 'failed' : record.passed > 0 ? 'passed' : 'unknown' },
              { label: 'Passed', value: record.passed },
              { label: 'Failed', value: record.failed },
              { label: 'Skipped', value: record.skipped },
              { label: 'Duration', value: record.durationMs !== undefined ? `${record.durationMs} ms` : undefined },
            ]} />
          </DetailSection>
          {record.failureFingerprints.length > 0 && (
            <DetailSection title="Failure fingerprints">
              <ResultBlock value={record.failureFingerprints.join('\n')} />
            </DetailSection>
          )}
          {record.outputExcerpt && (
            <DetailSection title="Output excerpt">
              <ResultBlock value={record.outputExcerpt} />
            </DetailSection>
          )}
        </>
      );
    case 'agent-message':
      return (
        <>
          <DetailSection title={displayType(record)}>
            <div className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[12px] leading-relaxed text-(--vestara-text)">
              <MarkdownRenderer content={record.content || '(no content)'} />
            </div>
          </DetailSection>
          {(record.messageKind === 'approval-request' || record.messageKind === 'approval-decision' || record.toolName || record.risk || record.status) && (
            <DetailSection title="Tool / approval context">
              <FieldGrid rows={[
                { label: 'Message kind', value: record.messageKind },
                { label: 'Tool', value: record.toolName },
                { label: 'Risk', value: record.risk },
                { label: 'Status', value: record.status },
                { label: 'Thread', value: record.threadId },
                { label: 'Turn', value: record.turnId },
              ]} />
            </DetailSection>
          )}
        </>
      );
    default:
      return (
        <DetailSection title="Activity">
          <div className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2 text-[12px] leading-relaxed text-(--vestara-text)">
            <MarkdownRenderer content={contentLine(record)} />
          </div>
        </DetailSection>
      );
  }
}

function attentionExplanation(record: ActivityRecord): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string | number | undefined): void => {
    if (value === undefined || value === '') return;
    rows.push({ label, value: String(value) });
  };

  if (record.kind === 'task' && ['blocked', 'failed', 'awaiting-approval'].includes(record.status)) {
    push('Why it needs attention', `Task is ${record.status}`);
    push('Summary', record.summary);
  }
  if (record.kind === 'workflow' && record.authoritative && record.currentState === 'failed') {
    push('Why it needs attention', 'Workflow failed');
    push('Reason', record.reason);
  }
  if (record.kind === 'verification' && (record.outcome === 'failed' || record.outcome === 'blocked')) {
    push('Why it needs attention', `Verification ${record.outcome}`);
    push('Failed checks', record.checks.filter((check) => check.status === 'failed').length);
    push('Blocked checks', record.checks.filter((check) => check.status === 'blocked').length);
    push('Reason', record.reason);
  }
  if (record.kind === 'test' && record.failed > 0) {
    push('Why it needs attention', `${record.failed} test${record.failed === 1 ? '' : 's'} failed`);
    push('Command', record.command);
  }
  if (record.kind === 'tool-result' && record.status === 'failed') {
    push('Why it needs attention', 'Tool result failed');
    push('Tool', record.toolName);
    push('Status', record.status);
  }
  if (record.kind === 'agent-message' && record.messageKind === 'approval-request') {
    push('Why it needs attention', 'Approval requested');
    push('Tool', record.toolName);
    push('Risk', record.risk);
    push('Status', record.status);
  }
  if (record.effect === 'hold' || record.effect === 'finding' || record.effect === 'recommendation') {
    push('Why it needs attention', record.effect);
  }

  return rows;
}

/** Technical rows revealed under "Technical details". Absent fields stay absent. */
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
    case 'tool-call':
      push('Agent', record.agentId);
      push('Tool', record.toolName);
      push('Call ID', record.callID);
      push('Output', record.output);
      break;
    case 'tool-result':
      push('Agent', record.agentId);
      push('Tool', record.toolName);
      push('Call ID', record.callID);
      push('Status', record.status);
      push('Tool result / error', record.output);
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

export default function ActivityDetailDrawer({ record: recordProp, onClose, records }: ActivityDetailDrawerProps) {
  const [fullRecord, setFullRecord] = useState<ActivityRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityDetailTab>('overview');

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
    setActiveTab('overview');
  }, [recordProp?.id]);

  const record = fullRecord ?? recordProp;
  const loadingDetails = recordProp?.hasDetails === true && fullRecord === null;
  const severity = record ? severityOfRecord(record) : undefined;
  const rows = record ? technicalRows(record) : [];
  const attentionRows = record ? attentionExplanation(record) : [];
  const contextParts = record
    ? [
        record.workflowId && `Workflow ${record.workflowId}`,
        record.sessionId && `Session ${record.sessionId}`,
        record.taskId && `Task ${record.taskId}`,
      ].filter(Boolean)
    : [];
  const hasOperation = record?.kind === 'tool-call' || record?.kind === 'tool-result';
  const hasEvidence = (record?.evidenceRefs.length ?? 0) > 0;
  const hasRelated = Boolean(
    record &&
      ((record.relatesTo?.length ?? 0) > 0 ||
        record.correctionOf !== undefined ||
        record.workflowId !== undefined ||
        record.taskId !== undefined ||
        record.sessionId !== undefined ||
        record.originConversationId !== undefined),
  );
  const tabs: Array<{ id: ActivityDetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    ...(hasOperation ? [{ id: 'operations' as const, label: 'Operations' }] : []),
    ...(hasEvidence ? [{ id: 'evidence' as const, label: 'Evidence' }] : []),
    { id: 'raw', label: 'Raw data' },
  ];

  return (
    <Drawer
      open={recordProp !== null}
      onClose={onClose}
      title={record ? `${kindLabel(record.kind)} activity` : 'Activity'}
      position="right"
      defaultSize="medium"
      storageKey="activity-room-detail"
      header={
        record?.effect !== undefined ? (
          <span className="text-[10px] font-medium" style={{ color: effectAccent(record.effect) }}>
            {effectLabel(record.effect)}
          </span>
        ) : undefined
      }
      bodyClassName="activity-detail-drawer-body px-4 py-3"
    >
      {record && (
        <div className="activity-detail-drawer-content">
          <div role="tablist" aria-label="Activity detail views" className="activity-detail-tabs flex flex-wrap gap-1 border-b border-[var(--vestara-border-subtle)] pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-(--vestara-accent-bg) text-(--vestara-text)'
                    : 'text-(--vestara-text-muted) hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text)'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div key={record.id} className="activity-detail-tab-content">
            {activeTab === 'overview' && (
            <div className="activity-detail-overview space-y-3">
              <WorkspaceOperationalPanel
                icon={navIcon('activity')}
                title={contentLine(record)}
                description={`${displayType(record)} · ${formatRelative(record.timestamp)}`}
                actions={
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${severityBadge(severity ?? 'info')}`}>
                    {statusForRecord(record) ?? 'recorded'}
                  </span>
                }
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--vestara-accent-bg) text-xs font-semibold text-(--vestara-text-2)">
                    {actorInitials(record)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-(--vestara-text)">{record.actor.displayName || record.actor.id}</p>
                    <p className="text-xs text-(--vestara-text-muted)">{record.actor.role ?? record.actor.type}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-base text-(--vestara-text-2)">{kindIcon(record.kind)}</span>
                </div>
                {loadingDetails && <p className="mt-3 text-xs text-(--vestara-text-muted)">Loading full details…</p>}
                {contextParts.length > 0 && <p className="mt-3 text-xs text-(--vestara-text-muted)">{contextParts.join(' · ')}</p>}
              </WorkspaceOperationalPanel>

              <WorkspaceOperationalPanel icon={navIcon('files')} title="Activity details" description="Authoritative content and lifecycle information." scrollable className="activity-detail-content-panel">
                {renderPrimaryDetails(record)}
                {attentionRows.length > 0 && <FieldGrid rows={attentionRows} />}
              </WorkspaceOperationalPanel>

              {hasRelated && (
                <WorkspaceOperationalPanel icon={navIcon('graph')} title="Related entities" description="Only exact identifiers present on this Activity record are shown.">
                  <FieldGrid
                    rows={[
                      { label: 'Workflow run', value: record.workflowId },
                      { label: 'Task', value: record.taskId },
                      { label: 'Runtime session', value: record.sessionId },
                      { label: 'Origin conversation', value: record.originConversationId },
                      ...(record.correctionOf ? [{ label: 'Correction of', value: resolveTitle(records, record.correctionOf) }] : []),
                    ]}
                  />
                  {record.relatesTo && record.relatesTo.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {record.relatesTo.map((id) => (
                        <span key={id} title={id} className="rounded-md border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-1 text-xs text-(--vestara-text-2)">
                          {resolveTitle(records, id)}
                        </span>
                      ))}
                    </div>
                  )}
                </WorkspaceOperationalPanel>
              )}

              <WorkspaceOperationalPanel icon={navIcon('settings')} title="Technical details" description="Identifiers and provenance for precise inspection.">
                <FieldGrid rows={rows} />
              </WorkspaceOperationalPanel>
            </div>
            )}

            {activeTab === 'operations' && hasOperation && (
            <WorkspaceOperationalPanel icon={navIcon('tools')} title="Operation" description="The selected Activity record carries this exact operation identity." scrollable className="activity-detail-content-panel">
              <FieldGrid
                rows={
                  record.kind === 'tool-call'
                    ? [
                        { label: 'Tool', value: record.toolName },
                        { label: 'Status', value: 'running' },
                        { label: 'Call ID', value: record.callID },
                        { label: 'Agent', value: record.agentId },
                      ]
                    : [
                        { label: 'Tool', value: record.toolName },
                        { label: 'Status', value: record.status },
                        { label: 'Call ID', value: record.callID },
                        { label: 'Agent', value: record.agentId },
                      ]
                }
              />
              {record.output && <div className="mt-3"><ResultBlock value={record.output} /></div>}
            </WorkspaceOperationalPanel>
            )}

            {activeTab === 'evidence' && hasEvidence && (
            <WorkspaceOperationalPanel icon={navIcon('files')} title="Evidence references" description="Exact references carried by the Activity record; not inferred artifacts." scrollable className="activity-detail-content-panel">
              <div className="flex flex-wrap gap-2">
                {record.evidenceRefs.map((ref) => (
                  <span key={ref} className="rounded-md border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-1 font-mono text-xs text-(--vestara-text-2)">
                    {ref}
                  </span>
                ))}
              </div>
            </WorkspaceOperationalPanel>
            )}

            {activeTab === 'raw' && (
            <WorkspaceOperationalPanel icon={navIcon('terminal')} title="Raw data" description="Authoritative payload retained for debugging and evidence inspection." scrollable className="activity-detail-content-panel">
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-3 font-mono text-xs leading-relaxed text-(--vestara-text-muted)">
                {JSON.stringify(record, null, 2)}
              </pre>
            </WorkspaceOperationalPanel>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
