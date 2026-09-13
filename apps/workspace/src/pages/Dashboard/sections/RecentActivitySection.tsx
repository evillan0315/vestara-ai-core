import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashTile, enterDelay } from '../dashPremium';

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  message: string;
  actor: { name: string };
}

interface RecentActivitySectionProps {
  logEvents: ActivityLogEntry[];
  dragSection: DragSectionProps;
}

export default function RecentActivitySection({ logEvents, dragSection }: RecentActivitySectionProps) {
  if (logEvents.length === 0) return null;

  return (
    <DashboardSection title="Recent Activity" icon="📋" dragSection={dragSection}>
      <ul className="space-y-1">
        {logEvents.map((e, i) => (
          <li key={e.id} className="mpg-enter" style={enterDelay(i)}>
            <div className="mpg-category-row group">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <DashTile accent="#6b7280">📋</DashTile>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                    {e.message}
                  </span>
                  <span className="block truncate text-[11px] capitalize text-[var(--vestara-text-muted)]">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {e.category} ·{' '}
                    {e.actor.name}
                  </span>
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-center">
        <a href="/logs" className="mpg-link">
          View all logs<span aria-hidden="true"> ›</span>
        </a>
      </div>
    </DashboardSection>
  );
}
