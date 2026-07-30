import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface RecentSessionsSectionProps {
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function RecentSessionsSection({ execSessions, dragSection }: RecentSessionsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Recent Sessions" icon="▶" dragSection={dragSection}>
      <div className="space-y-1.5">
        {execSessions.slice(0, 4).map((s) => (
          <a
            key={s.id as string}
            href={`/sessions/${s.id}`}
            className="flex items-center gap-2 p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px]"
            style={{
              borderLeftColor: s.status === 'completed' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#f59e0b',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-(--vestara-text) truncate font-medium">{s.goal as string}</div>
              <div className="text-[8px] text-(--vestara-text-muted)">
                {s.status as string} · {s.createdAt ? new Date(s.createdAt as string).toLocaleDateString() : ''}
              </div>
            </div>
            <span
              className={`text-[7px] px-1 py-0.5 rounded uppercase font-medium ${s.status === 'completed' ? 'bg-green-400/10 text-green-400' : s.status === 'failed' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'}`}
            >
              {s.status as string}
            </span>
          </a>
        ))}
        {execSessions.length > 4 && (
          <a
            href="/sessions"
            className="block text-[8px] text-(--vestara-text-muted) text-center py-1 hover:text-(--vestara-text-2) transition-colors rounded bg-zinc-800/20"
          >
            View all sessions →
          </a>
        )}
      </div>
    </DashboardSection>
  );
}
