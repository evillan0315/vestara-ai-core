import type { MilestoneResponse } from '../../../components/dashboard/constants';
import { ERA_COLORS } from '../../../components/dashboard/constants';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface RecentMilestonesSectionProps {
  recentCompletions: MilestoneResponse['milestones'];
  dragSection: DragSectionProps;
}

export default function RecentMilestonesSection({ recentCompletions, dragSection }: RecentMilestonesSectionProps) {
  if (recentCompletions.length === 0) return null;

  return (
    <DashboardSection title="Recent Milestones" icon="🎯" dragSection={dragSection}>
      <div className="space-y-1">
        {recentCompletions.map((m) => (
          <div
            key={m.version}
            className="flex items-center gap-3 p-2 bg-zinc-900/30 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors border-l-[3px] border-l-green-500/40"
          >
            <span className="text-[9px] font-mono text-zinc-600 w-14">{m.version}</span>
            <span className="text-[10px] text-zinc-400 flex-1 truncate">{m.name}</span>
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: ERA_COLORS[m.era] || '#6b7280' }}
            />
            <span className="text-[8px] text-zinc-700 bg-zinc-800/50 rounded px-1 py-0.5">{m.era}</span>
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
