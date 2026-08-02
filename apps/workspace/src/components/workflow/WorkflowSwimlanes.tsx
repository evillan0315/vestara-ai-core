/**
 * WorkflowSwimlanes — multi-agent visibility. Each lane is one owning agent
 * with its stage segments in time order (`Planner ●━━━`, `Developer ●━━━✓`,
 * `Verifier ●━━━✓`). The global lifecycle rail remains the shared spine.
 */

import type { WorkflowSwimlane, WorkflowSwimlaneSegment } from '../../lib/workflow';

function segmentMark(segment: WorkflowSwimlaneSegment): { glyph: string; color: string } {
  switch (segment.status) {
    case 'completed':
      return { glyph: '✓', color: 'text-(--vestara-green)' };
    case 'failed':
      return { glyph: '✗', color: 'text-(--vestara-red)' };
    case 'blocked':
      return { glyph: '⊘', color: 'text-(--vestara-amber)' };
    case 'active':
      return { glyph: '●', color: 'text-(--vestara-accent-text)' };
    default:
      return { glyph: '○', color: 'text-(--vestara-text-dim)' };
  }
}

function laneColor(agentId: string): string {
  const key = agentId.toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('developer')) return 'text-(--vestara-amber)';
  if (key.includes('verif') || key.includes('review')) return 'text-(--vestara-green)';
  if (key.includes('conversation')) return 'text-(--vestara-purple)';
  if (key.includes('plan')) return 'text-(--vestara-blue)';
  return 'text-(--vestara-text-2)';
}

export function WorkflowSwimlanes({ lanes }: { lanes: WorkflowSwimlane[] }) {
  if (!lanes || lanes.length === 0) return null;
  return (
    <div className="mt-2 p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md">
      <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1.5">
        Agent Swimlanes
      </div>
      <div className="space-y-1.5">
        {lanes.map((lane) => (
          <div key={lane.agentId} className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-medium w-20 shrink-0 ${laneColor(lane.agentId)}`}>
              {lane.agentName || lane.agentId}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {lane.segments.map((segment, index) => {
                const { glyph, color } = segmentMark(segment);
                const duration = segment.durationMs != null ? `${(segment.durationMs / 1000).toFixed(1)}s` : '';
                return (
                  <span key={segment.stageId} className="flex items-center gap-1">
                    {index > 0 && <span className="text-(--vestara-text-dim)">━</span>}
                    <span className={`text-[10px] ${color}`}>
                      {glyph} {segment.stageId}
                      {duration && <span className="text-(--vestara-text-dim) text-[8px]"> {duration}</span>}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
