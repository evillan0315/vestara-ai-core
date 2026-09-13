import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashTile, enterDelay } from '../dashPremium';

interface RecentSessionsSectionProps {
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function RecentSessionsSection({ execSessions, dragSection }: RecentSessionsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Recent Sessions" icon="▶" dragSection={dragSection}>
      <ul className="space-y-1">
        {execSessions.slice(0, 4).map((s, i) => {
          const accent = s.status === 'completed' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#f59e0b';
          return (
            <li key={s.id as string} className="mpg-enter" style={enterDelay(i)}>
              <a href={`/sessions/${s.id}`} className="mpg-category-row group">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <DashTile accent={accent}>▶</DashTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {s.goal as string}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                      {s.createdAt ? new Date(s.createdAt as string).toLocaleDateString() : ''}
                    </span>
                  </span>
                </span>
                <DashPill dot={accent}>{s.status as string}</DashPill>
              </a>
            </li>
          );
        })}
      </ul>
      {execSessions.length > 4 && (
        <div className="mt-2 text-center">
          <a href="/sessions" className="mpg-link">
            View all sessions<span aria-hidden="true"> ›</span>
          </a>
        </div>
      )}
    </DashboardSection>
  );
}
