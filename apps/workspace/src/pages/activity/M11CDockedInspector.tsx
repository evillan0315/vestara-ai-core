/**
 * M11C Docked Inspector Panel
 *
 * The contextual inspector: detail plane for whatever the Director selects —
 * a record, a participant, or an open effective-state item.
 *
 * Design spec: activity-room-visual-design-spec.md §2.6
 *   - Target width: 320px, bounds 300–340px
 *   - Docked column at >=1440px
 *   - Right-side drawer at 1024–1439px and 768–1023px
 *   - Bottom sheet at <768px
 *
 * Content: record detail (lazy hydration), participant detail,
 * effective-state detail, corrections, related activity, receipts,
 * evidence references.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import type { M11AActivityRecord } from '../../lib/m11a-api';
import { Pill, StatusIndicator } from '@vestara/ui';

// ─── Types ───────────────────────────────────────────────────

interface DockedInspectorProps {
  /** The item to display in the inspector. */
  readonly item: M11CStreamItem | null;
  /** Drill-down records for aggregated items. */
  readonly drillDownRecords?: readonly M11AActivityRecord[];
  /** Whether drill-down is loading. */
  readonly drillDownLoading?: boolean;
  /** Callback to close the inspector. */
  readonly onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────

export default function DockedInspector({
  item,
  drillDownRecords,
  drillDownLoading,
  onClose,
}: DockedInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, onClose]);

  // Focus trap
  useEffect(() => {
    if (item && panelRef.current) {
      panelRef.current.focus();
    }
  }, [item]);

  if (!item) return null;

  const kindLabel = (() => {
    switch (item.kind) {
      case 'conversation': return 'Message';
      case 'interaction': return 'Interaction';
      case 'activity': return 'Activity';
      case 'progress': return 'Progress';
      case 'log': return 'Event';
      case 'error': return 'Error';
      default: return item.kind;
    }
  })();

  const importanceVariant = (() => {
    switch (item.importance) {
      case 'primary': return 'live';
      case 'secondary': return 'warn';
      case 'muted': return 'idle';
      default: return 'idle';
    }
  })();

  return (
    <div
      ref={panelRef}
      className="ar-inspector"
      role="complementary"
      aria-label="Activity detail"
      tabIndex={-1}
    >
      {/* Header */}
      <div className="ar-inspector__header">
        <h3 className="ar-inspector__title">Detail</h3>
        <button
          type="button"
          onClick={onClose}
          className="ar-inspector__close"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="ar-inspector__content ar-scroll">
        {/* Actor */}
        <div className="ar-inspector__section">
          <div className="ar-inspector__label">Actor</div>
          <div className="ar-inspector__value">
            {item.actor.displayName}
            {item.actor.role && (
              <span className="ar-inspector__muted"> ({item.actor.role})</span>
            )}
          </div>
        </div>

        {/* Kind + Importance */}
        <div className="ar-inspector__section">
          <div className="ar-inspector__label">Type</div>
          <div className="ar-inspector__value ar-inspector__row">
            <StatusIndicator
              variant={importanceVariant}
              size="xs"
              ariaLabel={`Importance: ${item.importance}`}
            />
            <span>{kindLabel}</span>
            <span className="ar-inspector__muted">· {item.importance}</span>
          </div>
        </div>

        {/* Content */}
        <div className="ar-inspector__section">
          <div className="ar-inspector__label">Content</div>
          <div className="ar-inspector__content-text">
            {item.content || <span className="ar-inspector__muted">(no content)</span>}
          </div>
        </div>

        {/* Metadata */}
        <div className="ar-inspector__section">
          <div className="ar-inspector__label">Metadata</div>
          <div className="ar-inspector__meta">
            <div>Sequence: {item.sequence}</div>
            <div>Timestamp: {item.timestamp}</div>
            {item.workflowRunId && <div>Workflow: {item.workflowRunId}</div>}
            {item.executionId && <div>Execution: {item.executionId}</div>}
            {item.taskId && <div>Task: {item.taskId}</div>}
          </div>
        </div>

        {/* Aggregated */}
        {item.aggregated && (
          <div className="ar-inspector__section">
            <div className="ar-inspector__label">Aggregated</div>
            <div className="ar-inspector__meta">
              <div>{item.aggregated.count} items · {item.aggregated.kind}</div>
              <div>Summary: {item.aggregated.summary}</div>
              <div>Sequence range: {item.aggregated.sequenceRange.first} – {item.aggregated.sequenceRange.last}</div>
              <div>{item.aggregated.referencedActivityIds.length} referenced activity IDs</div>
            </div>
          </div>
        )}

        {/* Drill-down records */}
        {drillDownLoading && (
          <div className="ar-inspector__section">
            <div className="ar-inspector__label">Loading referenced activities…</div>
          </div>
        )}
        {!drillDownLoading && drillDownRecords && drillDownRecords.length > 0 && (
          <div className="ar-inspector__section">
            <div className="ar-inspector__label">Referenced Activities ({drillDownRecords.length})</div>
            <div className="ar-inspector__drill-down">
              {drillDownRecords.map((record) => (
                <div key={record.id} className="ar-inspector__drill-down-item">
                  <div className="ar-inspector__drill-down-header">
                    <span className="ar-inspector__drill-down-kind">{record.kind}</span>
                    <span className="ar-inspector__muted">·</span>
                    <span>{record.actor?.displayName ?? 'Unknown'}</span>
                    <span className="ar-inspector__muted">·</span>
                    <span className="ar-inspector__muted">{record.timestamp}</span>
                  </div>
                  {record.content && (
                    <div className="ar-inspector__drill-down-content">{record.content}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
