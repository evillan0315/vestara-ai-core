import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashTile, enterDelay } from '../dashPremium';

interface ExecSessionsSectionProps {
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function ExecSessionsSection({ execSessions, dragSection }: ExecSessionsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Execution Sessions" icon="▶" dragSection={dragSection}>
      <ul className="space-y-1">
        {execSessions.slice(0, 5).map((s, i) => {
          const accent = s.status === 'completed' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#f59e0b';
          return (
            <li key={s.id as string} className="mpg-enter" style={enterDelay(i)}>
              <div className="mpg-category-row group">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <DashTile accent={accent}>▶</DashTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {s.goal as string}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                      {(s.metrics as Record<string, number>)?.completedSteps ?? 0}/
                      {(s.metrics as Record<string, number>)?.totalSteps ?? 0} steps ·{' '}
                      {(s.assignedAgentIds as unknown[])?.length ?? 0} agents
                    </span>
                  </span>
                </span>
                <DashPill dot={accent}>{s.status as string}</DashPill>
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardSection>
  );
}
