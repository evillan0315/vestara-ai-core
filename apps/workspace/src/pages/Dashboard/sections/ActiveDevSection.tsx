import { MarketplaceEmptyState } from '../../Marketplace/MarketplaceLayout-components.js';
import type { MilestoneResponse } from '../../../components/dashboard/constants';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashTile, enterDelay } from '../dashPremium';

interface ActiveDevSectionProps {
  activeMilestones: MilestoneResponse['milestones'];
  upcomingMilestones: MilestoneResponse['milestones'];
  updateMilestoneStatus: (version: string, status: string) => Promise<void>;
  dragSection: DragSectionProps;
}

export default function ActiveDevSection({
  activeMilestones,
  upcomingMilestones,
  updateMilestoneStatus,
  dragSection,
}: ActiveDevSectionProps) {
  if (activeMilestones.length === 0 && upcomingMilestones.length === 0) {
    return (
      <DashboardSection title="Active Development" icon="△" dragSection={dragSection}>
        <MarketplaceEmptyState message="All milestones completed." />
      </DashboardSection>
    );
  }

  return (
    <DashboardSection title="Active Development" icon="△" dragSection={dragSection}>
      <ul className="space-y-1">
        {activeMilestones.map((m, i) => (
          <li key={m.version} className="mpg-enter" style={enterDelay(i)}>
            <div className="mpg-category-row group">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <DashTile accent="#f59e0b">△</DashTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                    <span className="mr-2 font-mono text-[11px] font-normal text-amber-400">{m.version}</span>
                    {m.name}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{m.description}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <select
                  value={m.status}
                  onChange={(e) => updateMilestoneStatus(m.version, e.target.value)}
                  className="mpg-sort cursor-pointer"
                  aria-label={`Status for ${m.name}`}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <DashPill dot="#f59e0b">Active</DashPill>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {upcomingMilestones.length > 0 && (
        <>
          <div className="px-1 pt-2 text-[9px] uppercase tracking-widest text-(--vestara-text-muted)">Next Up</div>
          <ul className="space-y-1">
            {upcomingMilestones.map((m, i) => (
              <li key={m.version} className="mpg-enter" style={enterDelay(i)}>
                <div className="mpg-category-row group">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <DashTile accent="#52525b">○</DashTile>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                        <span className="mr-2 font-mono text-[11px] font-normal text-[var(--vestara-text-muted)]">
                          {m.version}
                        </span>
                        {m.name}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <select
                      value={m.status}
                      onChange={(e) => updateMilestoneStatus(m.version, e.target.value)}
                      className="mpg-sort cursor-pointer"
                      aria-label={`Status for ${m.name}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <span className="mpg-tag-pill shrink-0">{m.era}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardSection>
  );
}
