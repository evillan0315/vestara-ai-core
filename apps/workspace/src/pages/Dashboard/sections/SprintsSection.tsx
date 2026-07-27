import DashboardSection from '../DashboardSection';
import type { DragSectionProps } from '../DashboardSection';

interface SprintsSectionProps {
  sprints: { active: Record<string, unknown>[] };
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function SprintsSection({ sprints, execSessions, dragSection }: SprintsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Active Sprints" icon="▤" dragSection={dragSection}>
      <div className="space-y-2">
        {sprints.active.map((s) => {
          const daysLeft = Math.max(0, Math.ceil((new Date(s.endDate as string).getTime() - Date.now()) / 86_400_000));
          const totalDays = Math.max(
            1,
            Math.ceil(
              (new Date(s.endDate as string).getTime() - new Date(s.startDate as string).getTime()) / 86_400_000,
            ),
          );
          const pct = Math.round(((totalDays - daysLeft) / totalDays) * 100);
          return (
            <div
              key={s.id as string}
              className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg border-l-[3px]"
              style={{ borderLeftColor: daysLeft <= 3 ? '#ef4444' : '#22c55e' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-zinc-200">{s.name as string}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-zinc-700 font-mono">{daysLeft > 0 ? `${daysLeft}d` : 'Ending'}</span>
                  <span
                    className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${daysLeft <= 3 ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'}`}
                  >
                    {s.status as string}
                  </span>
                </div>
              </div>
              {typeof s.goal === 'string' && s.goal && <div className="text-[10px] text-zinc-500 mb-1">{s.goal}</div>}
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${daysLeft <= 3 ? 'bg-red-500' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}
