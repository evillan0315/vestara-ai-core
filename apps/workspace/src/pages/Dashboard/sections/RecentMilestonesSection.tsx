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
            className="flex items-center gap-3 p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px] border-l-green-500/40"
          >
            <span className="text-[9px] font-mono text-(--vestara-text-muted) w-14">{m.version}</span>
            <span className="text-[10px] text-(--vestara-text-2) flex-1 truncate">{m.name}</span>
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: ERA_COLORS[m.era] || '#6b7280' }}
            />
            <span className="text-[8px] text-(--vestara-text-dim) bg-zinc-800/50 rounded px-1 py-0.5">{m.era}</span>
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
