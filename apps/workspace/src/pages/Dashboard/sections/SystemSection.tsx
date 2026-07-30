import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface SystemSectionProps {
  connected: boolean;
  events: { readonly length: number };
  execSessions: Record<string, unknown>[];
  autoRefreshIntervalActive: boolean;
  lastRefresh: string;
  dragSection: DragSectionProps;
}

export default function SystemSection({
  connected,
  events,
  execSessions,
  autoRefreshIntervalActive,
  lastRefresh,
  dragSection,
}: SystemSectionProps) {
  return (
    <DashboardSection title="System" icon="⚙" dragSection={dragSection}>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Status</span>
          <span className={`flex items-center gap-1 ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Events</span>
          <span className="text-(--vestara-text)">{events.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Sessions</span>
          <span className="text-(--vestara-text)">{execSessions.length}</span>
        </div>
        {autoRefreshIntervalActive && (
          <div className="flex items-center justify-between">
            <span className="text-(--vestara-text-muted)">Auto-refresh</span>
            <span className="text-green-400">30s</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Last refresh</span>
          <span className="text-(--vestara-text-2)text-[10px]">{new Date(lastRefresh).toLocaleTimeString()}</span>
        </div>
      </div>
    </DashboardSection>
  );
}
