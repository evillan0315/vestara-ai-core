/**
 * Activity Room Context Panel (Right Column)
 *
 * Renders operational context backed by authoritative data:
 * - Activity Metrics (total events, participants, active agents)
 * - Recent Operations (last 5 stream items)
 * - OpenCode Session Status (live from /api/opencode/session/status)
 * - Activity Stream Status (single truthful connection indicator)
 *
 * All data sources are READY/DERIVABLE from existing projections.
 * No mocks, no placeholders, no fabricated operational data.
 */

import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { StatusIndicator } from '@vestara/ui';
import { formatRelative } from './activity-formatters';
import { CONNECTION_STATUS_CONFIG } from './status-config';
import { useSessionStatus } from '../../hooks/useSessionStatus';

// ─── Types ───────────────────────────────────────────────────

interface ActivityRoomContextPanelProps {
  /** Stream items for metrics and recent operations. */
  readonly stream: readonly M11CStreamItem[];
  /** Participant count for metrics. */
  readonly participantCount: number;
  /** Active agent count for metrics. */
  readonly activeAgentCount: number;
  /** Connection state for stream status. */
  readonly connectionState: M11CConnectionState;
}

// ─── Severity Badge ──────────────────────────────────────────

function OperationBadge({ kind }: { readonly kind: string }) {
  // Map stream item kind to severity badge
  const badgeClass = (() => {
    switch (kind) {
      case 'conversation':
        return 'ar-operation__badge--info';
      case 'interaction':
        return 'ar-operation__badge--info';
      case 'activity':
        return 'ar-operation__badge--success';
      case 'progress':
        return 'ar-operation__badge--info';
      case 'log':
        return 'ar-operation__badge--warning';
      case 'error':
        return 'ar-operation__badge--error';
      default:
        return 'ar-operation__badge--info';
    }
  })();

  const label = (() => {
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
      default:
        return kind;
    }
  })();

  return (
    <span className={`ar-operation__badge ${badgeClass}`}>
      {label}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function ActivityRoomContextPanel({
  stream,
  participantCount,
  activeAgentCount,
  connectionState,
}: ActivityRoomContextPanelProps) {
  // DERIVABLE: total events from stream length
  const totalEvents = stream.length;

  // DERIVABLE: recent operations (last 5 items)
  const recentOperations = stream.slice(-5).reverse();

  // READY: connection status from room.state
  const statusConfig = CONNECTION_STATUS_CONFIG[connectionState] ?? CONNECTION_STATUS_CONFIG.offline;

  // LIVE: OpenCode session status (polls /api/opencode/session/status)
  const { statusMap } = useSessionStatus({ intervalMs: 5_000 });
  const sessionEntries = Object.values(statusMap);
  const activeSessions = sessionEntries.filter((s) => s === 'active').length;
  const idleSessions = sessionEntries.filter((s) => s === 'idle').length;
  const failedSessions = sessionEntries.filter((s) => s === 'failed').length;

  return (
    <div className="ar-context" role="region" aria-label="Operational context">
      {/* ── Activity Metrics ────────────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">Activity Metrics</h3>
        </div>
        <div className="ar-context__metrics">
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--events">
              ◈
            </div>
            <div>
              <p className="ar-metric__value">{totalEvents}</p>
              <p className="ar-metric__label">Total Events</p>
            </div>
          </div>
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--participants">
              ●
            </div>
            <div>
              <p className="ar-metric__value">{participantCount}</p>
              <p className="ar-metric__label">Participants</p>
            </div>
          </div>
          <div className="ar-metric">
            <div className="ar-metric__icon ar-metric__icon--agents">
              ◉
            </div>
            <div>
              <p className="ar-metric__value">{activeAgentCount}</p>
              <p className="ar-metric__label">Active Agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Operations ───────────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">Recent Operations</h3>
        </div>
        <div className="ar-context__operations">
          {recentOperations.length === 0 ? (
            <div className="ar-operation__meta" style={{ padding: '0.375rem 0' }}>
              No recent operations
            </div>
          ) : (
            recentOperations.map((op) => (
              <div key={op.id} className="ar-operation">
                <div className="ar-operation__icon">
                  {op.actor.type === 'human' ? '✎' : '●'}
                </div>
                <div className="ar-operation__info">
                  <p className="ar-operation__name">
                    {op.content || op.kind}
                  </p>
                  <p className="ar-operation__meta">
                    {op.actor.displayName} · {formatRelative(op.timestamp)}
                  </p>
                </div>
                <OperationBadge kind={op.kind} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── OpenCode Sessions ───────────────────────────────── */}
      {sessionEntries.length > 0 && (
        <div className="ar-context__section">
          <div className="ar-context__section-header">
            <h3 className="ar-context__title">OpenCode Sessions</h3>
          </div>
          <div className="ar-context__metrics">
            {activeSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--agents">◉</div>
                <div>
                  <p className="ar-metric__value">{activeSessions}</p>
                  <p className="ar-metric__label">Active</p>
                </div>
              </div>
            )}
            {idleSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--events">○</div>
                <div>
                  <p className="ar-metric__value">{idleSessions}</p>
                  <p className="ar-metric__label">Idle</p>
                </div>
              </div>
            )}
            {failedSessions > 0 && (
              <div className="ar-metric">
                <div className="ar-metric__icon ar-metric__icon--error">✕</div>
                <div>
                  <p className="ar-metric__value">{failedSessions}</p>
                  <p className="ar-metric__label">Failed</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Activity Stream Status ──────────────────────────── */}
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">System Status</h3>
        </div>
        <div className="ar-context__stream-status">
          <StatusIndicator
            variant={statusConfig.variant}
            size="xs"
            pulse={connectionState === 'live'}
            ariaLabel={`Activity Stream: ${statusConfig.label}`}
          />
          <span className="ar-context__stream-status-label">
            Activity Stream
          </span>
          <span className={`ar-context__stream-status-state ar-context__stream-status-state--${statusConfig.variant}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>
    </div>
  );
}
