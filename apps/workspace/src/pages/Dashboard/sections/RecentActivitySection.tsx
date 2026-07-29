import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

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
      <div className="space-y-1">
        {logEvents.map((e) => (
          <div
            key={e.id}
            className="flex items-start gap-2 p-1.5 bg-zinc-900/20 border border-zinc-800/50 rounded border-l-2"
            style={{ borderLeftColor: '#6b7280' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[8px] text-zinc-700">
                <span>{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>·</span>
                <span className="capitalize text-zinc-600">{e.category}</span>
              </div>
              <div className="text-[9px] text-zinc-400 truncate">{e.message}</div>
            </div>
          </div>
        ))}
        <a
          href="/logs"
          className="block text-[8px] text-zinc-600 text-center py-1 hover:text-zinc-400 transition-colors rounded bg-zinc-800/20"
        >
          View all logs →
        </a>
      </div>
    </DashboardSection>
  );
}
