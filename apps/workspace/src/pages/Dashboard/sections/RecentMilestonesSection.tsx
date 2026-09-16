import type { MilestoneResponse } from '../../../components/dashboard/constants';
import { ERA_COLORS } from '../../../components/dashboard/constants';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashTile, enterDelay } from '../dashPremium';

interface RecentMilestonesSectionProps {
  recentCompletions: MilestoneResponse['milestones'];
  dragSection: DragSectionProps;
}

export default function RecentMilestonesSection({ recentCompletions, dragSection }: RecentMilestonesSectionProps) {
  if (recentCompletions.length === 0) return null;

  return (
    <DashboardSection title="Recent Milestones" icon="🎯" dragSection={dragSection}>
      <ul className="space-y-1">
        {recentCompletions.map((m, i) => (
          // Milestone data can contain exact duplicates (same version + name),
          // so version alone is not a unique key. The index disambiguates.
          <li key={`${m.version}:${m.name}:${i}`} className="mpg-enter" style={enterDelay(i)}>
            <div className="mpg-category-row group">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <DashTile accent={ERA_COLORS[m.era] || '#6b7280'}>🎯</DashTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                    {m.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-[var(--vestara-text-muted)]">{m.version}</span>
                </span>
              </span>
              <span className="mpg-tag-pill shrink-0">{m.era}</span>
            </div>
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}
