import type { ResolvedConfiguration } from '@vestara/configuration';
import { navIcon } from '../../layouts/workspace-navigation.js';
import type { RuntimeStatusDto } from '../../pages/Settings/settings-client.js';
import { ReferenceCard, Status } from '../../pages/Settings/settings-ui.js';

/**
 * WorkspaceStatusCard — shared workspace health snapshot.
 *
 * Pure projection of authoritative API/runtime state (no fetching, no
 * mutations), so any page holding a ResolvedConfiguration + runtime status
 * can render it: Settings, Overview, Diagnostics, or a context sidebar.
 */
export function WorkspaceStatusCard({
  runtime,
  configuration,
  className = '',
}: {
  runtime: RuntimeStatusDto;
  configuration: ResolvedConfiguration;
  className?: string;
}) {
  const rows = [
    ['Status', <Status key="status" bare value={runtime.status} />],
    ['API', runtime.apiEndpoint ? 'Connected API' : 'Unknown'],
    [
      'Version',
      <span key="version" className="font-mono">
        {runtime.runtimeVersion}
      </span>,
    ],
    ['Active executions', runtime.activeExecutionCount],
    ['Event store', runtime.engineeringEventStoreStatus],
    [
      'Revision',
      <span key="revision" className="font-mono">
        {configuration.revision.slice(0, 8)}
      </span>,
    ],
  ] as const;
  return (
    <ReferenceCard
      icon={navIcon('activity')}
      title="Workspace Status"
      description="Current workspace health and status."
      tone="info"
      className={`st-card-supporting ${className}`}
    >
      <div className="divide-y divide-[var(--vestara-border-subtle)]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="st-gap-field flex min-h-10 items-center justify-between py-[var(--vestara-spacing-element)]"
          >
            <span className="text-[var(--vestara-font-size-xs)] font-medium uppercase text-[var(--vestara-text-muted)]">
              {label}
            </span>
            <span className="min-w-0 truncate text-right text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">
              {value}
            </span>
          </div>
        ))}
      </div>
    </ReferenceCard>
  );
}

export default WorkspaceStatusCard;
