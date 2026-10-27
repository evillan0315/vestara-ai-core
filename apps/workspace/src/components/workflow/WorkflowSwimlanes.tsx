/**
 * WorkflowSwimlanes — multi-agent visibility. Each lane is one owning agent
 * with its stage segments in time order (`Planner ●━━━`, `Developer ●━━━✓`,
 * `Verifier ●━━━✓`). The global lifecycle rail remains the shared spine.
 */

import type { WorkflowSwimlane, WorkflowSwimlaneSegment } from '../../lib/workflow';

function segmentMark(segment: WorkflowSwimlaneSegment): { glyph: string; color: string } {
  switch (segment.status) {
    case 'completed':
      return { glyph: '✓', color: 'text-(--vestara-status-success)' };
    case 'failed':
      return { glyph: '✗', color: 'text-(--vestara-status-error)' };
    case 'blocked':
      return { glyph: '⊘', color: 'text-(--vestara-status-error)' };
    case 'active':
      return { glyph: '●', color: 'text-(--vestara-accent-text)' };
    default:
      return { glyph: '○', color: 'text-(--vestara-text-muted)' };
  }
}

function laneColor(agentId: string): string {
  const key = agentId.toLowerCase().replace(/[^a-z]/g, '');
  // Mirrors AGENT_TONE in WorkflowRail — every canonical pipeline stage
  // (context → analyst → planner → architect → developer → verifier →
  // reviewer → system) resolves to the same tone in both views.
  if (key.includes('developer')) return 'text-(--vestara-status-warning)';
  if (key.includes('verif') || key.includes('review')) return 'text-(--vestara-status-success)';
  if (key.includes('conversation') || key.includes('assistant')) return 'text-(--vestara-purple)';
  if (key.includes('context') || key.includes('analyst') || key.includes('plan') || key.includes('architect'))
    return 'text-(--vestara-status-info)';
  if (key.includes('system')) return 'text-(--vestara-text-muted)';
  return 'text-(--vestara-text-secondary)';
}

export function WorkflowSwimlanes({ lanes }: { lanes: WorkflowSwimlane[] }) {
  if (!lanes || lanes.length === 0) return null;
  const blockedTotal = lanes.reduce(
    (count, lane) =>
      count + lane.segments.filter((segment) => segment.status === 'blocked' || segment.status === 'failed').length,
    0,
  );
  return (
    <div className="mt-2 rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2">
      <div className="mb-1.5 text-[length:var(--vestara-font-size-caption)] uppercase tracking-wider text-[var(--vestara-text-muted)]">
        Agent Swimlanes
        {blockedTotal > 0 && (
          <span
            role="alert"
            aria-live="polite"
            className="ml-2 rounded-full border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-1.5 py-0.5 font-semibold normal-case text-[var(--vestara-status-error)]"
          >
            ⊘ {blockedTotal} blocked
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {lanes.map((lane) => {
          const laneBlocked = lane.segments.filter(
            (segment) => segment.status === 'blocked' || segment.status === 'failed',
          ).length;
          return (
            <div key={lane.agentId} className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`w-20 shrink-0 truncate text-[length:var(--vestara-font-size-caption)] font-medium ${laneColor(lane.agentId)}`}
              >
                {lane.agentName || lane.agentId}
                {laneBlocked > 0 && <span className="text-[var(--vestara-status-error)]"> ⊘{laneBlocked}</span>}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {lane.segments.map((segment, index) => {
                  const { glyph, color } = segmentMark(segment);
                  const duration = segment.durationMs != null ? `${(segment.durationMs / 1000).toFixed(1)}s` : '';
                  const stuck = segment.status === 'blocked' || segment.status === 'failed';
                  return (
                    <span key={segment.stageId} className="flex items-center gap-1">
                      {index > 0 && <span className="text-[var(--vestara-text-muted)]">━</span>}
                      <span
                        className={`text-[length:var(--vestara-font-size-caption)] ${color} ${stuck ? 'font-semibold' : ''}`}
                      >
                        {glyph} {segment.stageId}
                        {duration && (
                          <span className="text-[var(--vestara-text-muted)] text-[length:var(--vestara-font-size-caption)]">
                            {' '}
                            {duration}
                          </span>
                        )}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
