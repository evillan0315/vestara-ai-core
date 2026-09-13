import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashProgress, DashTile, enterDelay } from '../dashPremium';

interface SprintsSectionProps {
  sprints: { active: Record<string, unknown>[] };
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function SprintsSection({ sprints, execSessions, dragSection }: SprintsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Active Sprints" icon="▤" dragSection={dragSection}>
      <ul className="space-y-1">
        {sprints.active.map((s, i) => {
          const daysLeft = Math.max(0, Math.ceil((new Date(s.endDate as string).getTime() - Date.now()) / 86_400_000));
          const totalDays = Math.max(
            1,
            Math.ceil(
              (new Date(s.endDate as string).getTime() - new Date(s.startDate as string).getTime()) / 86_400_000,
            ),
          );
          const pct = Math.round(((totalDays - daysLeft) / totalDays) * 100);
          const accent = daysLeft <= 3 ? '#ef4444' : '#22c55e';
          return (
            <li key={s.id as string} className="mpg-enter" style={enterDelay(i)}>
              <div className="mpg-category-row group">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <DashTile accent={accent}>▤</DashTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {s.name as string}
                      <span className="ml-2 font-mono text-[10px] font-normal text-[var(--vestara-text-muted)]">
                        {daysLeft > 0 ? `${daysLeft}d left` : 'Ending'}
                      </span>
                    </span>
                    {typeof s.goal === 'string' && s.goal && (
                      <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{s.goal}</span>
                    )}
                    <span className="mt-1 block">
                      <DashProgress value={pct} color={daysLeft <= 3 ? '#ef4444' : '#f59e0b'} />
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
