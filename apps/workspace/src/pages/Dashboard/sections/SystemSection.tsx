import DashboardSection from '../DashboardSection';
import type { DragSectionProps } from '../DashboardSection';

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
          <span className="text-zinc-600">Status</span>
          <span className={`flex items-center gap-1 ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Events</span>
          <span className="text-zinc-300">{events.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Sessions</span>
          <span className="text-zinc-300">{execSessions.length}</span>
        </div>
        {autoRefreshIntervalActive && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Auto-refresh</span>
            <span className="text-green-400">30s</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Last refresh</span>
          <span className="text-zinc-500 text-[10px]">{new Date(lastRefresh).toLocaleTimeString()}</span>
        </div>
      </div>
    </DashboardSection>
  );
}
