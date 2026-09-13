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
          <span className="mpg-tag-pill">
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: connected ? 'var(--vestara-status-success)' : 'var(--vestara-status-error)',
                boxShadow: `0 0 6px ${connected ? 'var(--vestara-status-success)' : 'var(--vestara-status-error)'}`,
              }}
            />
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
