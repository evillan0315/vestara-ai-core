/**
 * M11CActivityDetailModal — readable Activity record detail dialog.
 *
 * Opened by the Activity Stream `Detail` action (`ui.openDetail`). The stream
 * stays a concise projection (clamped rows, collapsed bodies); this modal
 * carries the complete available detail for the selected record:
 *
 *   - full textual content rendered through the canonical `MarkdownRenderer`
 *     (GFM, fenced code with horizontal overflow, tables, safe links —
 *     never raw HTML);
 *   - record/event type, actor/agent, timestamp, status (importance);
 *   - workflow/execution/task relationship where available;
 *   - referenced-activity and aggregated drill-down records where available.
 *
 * Shell behavior (focus enters, Escape closes, focus trap, focus return) is
 * owned by the canonical `VestaraModal`. Fields that are absent stay absent
 * (UNKNOWN is preserved, never inferred).
 *
 * Bounds: read-only. No domain contracts, persistence, virtualization, or
 * routing/execution authority changes.
 */

import { useEffect } from 'react';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import { MarkdownRenderer, preloadMarkdownRenderer } from '../../components/chat/MarkdownRenderer';
import { VestaraModal } from '../../components/ui/VestaraModal';

interface M11CActivityDetailModalProps {
  /** The selected record. Null renders nothing (caller gates on this). */
  readonly item: M11CStreamItem | null;
  /** Drill-down records for aggregated items (already fetched by the page). */
  readonly drillDownRecords?: readonly M11CStreamItem[];
  /** Whether drill-down records are still loading. */
  readonly drillDownLoading?: boolean;
  /** Close the dialog (Escape, overlay, explicit Close). */
  readonly onClose: () => void;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'conversation':
      return 'Message';
    case 'interaction':
      return 'Interaction';
    case 'activity':
      return 'Activity';
    case 'progress':
      return 'Progress';
    case 'log':
      return 'Event';
    case 'error':
      return 'Error';
    case 'tool-call':
      return 'Tool call';
    case 'tool-result':
      return 'Tool result';
    case 'evidence':
      return 'Evidence';
    default:
      return kind;
  }
}

function formatAbsolute(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

function MetadataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-3 py-1.5">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wider text-[var(--vestara-text-dim)]">{label}</dt>
      <dd className="min-w-0 break-words text-sm leading-relaxed text-[var(--vestara-text-secondary)]">{children}</dd>
    </div>
  );
}

function DrillDownCard({ record }: { record: M11CStreamItem }) {
  return (
    <div className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--vestara-text-muted)]">
        <span className="font-medium text-[var(--vestara-text-secondary)]">{kindLabel(record.kind)}</span>
        <span aria-hidden="true">·</span>
        <span>{record.actor?.displayName ?? 'Unknown'}</span>
        <span aria-hidden="true">·</span>
        <span>{formatAbsolute(record.timestamp)}</span>
      </div>
      {record.content ? (
        <div className="text-sm leading-relaxed text-[var(--vestara-text-secondary)]">
          <MarkdownRenderer content={record.content} />
        </div>
      ) : (
        <span className="text-sm italic text-[var(--vestara-text-muted)]">(no content)</span>
      )}
    </div>
  );
}

export default function M11CActivityDetailModal({
  item,
  drillDownRecords,
  drillDownLoading,
  onClose,
}: M11CActivityDetailModalProps) {
  // Warm the lazy markdown chunk so full content renders without a flash of
  // fallback text when the dialog opens.
  useEffect(() => {
    if (item) preloadMarkdownRenderer();
  }, [item]);

  if (!item) return null;

  const subline = [item.actor.displayName, kindLabel(item.kind), formatAbsolute(item.timestamp)]
    .filter(Boolean)
    .join(' • ');

  return (
    <VestaraModal
      onClose={onClose}
      ariaLabel={`Activity detail: ${kindLabel(item.kind)} from ${item.actor.displayName}`}
      className="max-w-3xl max-h-[85vh] flex flex-col"
    >
      {/* ─── Header ─── */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--vestara-border-subtle)] px-5 py-4">
        <div className="min-w-0">
          <h2 id="activity-detail-title" className="text-base font-semibold text-[var(--vestara-text)]">
            Activity Detail
          </h2>
          <p className="mt-0.5 truncate text-xs text-[var(--vestara-text-muted)]" title={subline}>
            {subline}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close activity detail"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--vestara-radius)] text-lg text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {/* ─── Scrollable body: complete content, then metadata ─── */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        tabIndex={0}
        role="region"
        aria-label="Activity detail content"
      >
        {/* Complete readable content */}
        <section aria-label="Content">
          {item.content ? (
            <div className="text-sm leading-relaxed text-[var(--vestara-text)]">
              <MarkdownRenderer content={item.content} />
            </div>
          ) : (
            <p className="text-sm italic text-[var(--vestara-text-muted)]">(no content)</p>
          )}
        </section>

        {/* Referenced / aggregated records */}
        {drillDownLoading && (
          <p className="mt-4 text-sm text-[var(--vestara-text-muted)]" role="status">
            Loading referenced activities…
          </p>
        )}
        {!drillDownLoading && drillDownRecords && drillDownRecords.length > 0 && (
          <section aria-label={`Referenced activities (${drillDownRecords.length})`} className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--vestara-text-dim)]">
              Referenced Activities ({drillDownRecords.length})
            </h3>
            <div className="space-y-2">
              {drillDownRecords.map((record) => (
                <DrillDownCard key={record.id} record={record} />
              ))}
            </div>
          </section>
        )}

        {/* Metadata / evidence already represented on the record */}
        <section aria-label="Metadata" className="mt-5 border-t border-[var(--vestara-border-subtle)] pt-3">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--vestara-text-dim)]">
            Metadata
          </h3>
          <dl className="divide-y divide-[var(--vestara-border-subtle)]">
            <MetadataRow label="Type">
              {kindLabel(item.kind)} · {item.importance}
            </MetadataRow>
            <MetadataRow label="Actor">
              {item.actor.displayName}
              {item.actor.role && <span className="text-[var(--vestara-text-muted)]"> ({item.actor.role})</span>}
            </MetadataRow>
            <MetadataRow label="Agent / Source">
              <span className="font-mono">{item.actor.id}</span>
              <span className="text-[var(--vestara-text-muted)]"> ({item.actor.type})</span>
            </MetadataRow>
            <MetadataRow label="Timestamp">{formatAbsolute(item.timestamp)}</MetadataRow>
            <MetadataRow label="Sequence">
              <span className="font-mono">{item.sequence}</span>
            </MetadataRow>
            {item.workflowRunId && (
              <MetadataRow label="Workflow">
                <span className="font-mono">{item.workflowRunId}</span>
              </MetadataRow>
            )}
            {item.executionId && (
              <MetadataRow label="Execution">
                <span className="font-mono">{item.executionId}</span>
              </MetadataRow>
            )}
            {item.taskId && (
              <MetadataRow label="Task">
                <span className="font-mono">{item.taskId}</span>
              </MetadataRow>
            )}
            {item.referencedActivityIds && item.referencedActivityIds.length > 0 && (
              <MetadataRow label="References">
                <span className="font-mono">{item.referencedActivityIds.join(', ')}</span>
              </MetadataRow>
            )}
            {item.aggregated && (
              <MetadataRow label="Aggregated">
                {item.aggregated.count} {item.aggregated.kind} · {item.aggregated.summary} · sequences{' '}
                {item.aggregated.sequenceRange.first}–{item.aggregated.sequenceRange.last} ·{' '}
                {item.aggregated.referencedActivityIds.length} referenced
              </MetadataRow>
            )}
            {item.interaction && (
              <MetadataRow label="Interaction">
                {item.interaction.lifecycle}
                {item.interaction.choices && item.interaction.choices.length > 0 && (
                  <> · choices: {item.interaction.choices.map((choice) => choice.label).join(', ')}</>
                )}
                {item.interaction.selectedChoiceId && <> · selected: {item.interaction.selectedChoiceId}</>}
                {item.interaction.respondingParticipantName && <> · by {item.interaction.respondingParticipantName}</>}
              </MetadataRow>
            )}
          </dl>
        </section>
      </div>
    </VestaraModal>
  );
}
