/**
 * VES-UI-001 T5: Agents Package
 *
 * Agent grid promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/AgentWorkforce.tsx`).
 * Data: `GET /api/agents` via `useAgentsPackage` → `agentsPackageFixture`.
 * Never hardcoded arrays in JSX.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Agent Workforce + data)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useState } from 'react';
import { PackageEmpty, PackageSearchInput, PackageSkeleton, PackageSubHeader } from './PackageChrome';
import { useAgentsPackage } from './useAgentsPackage';

function agentTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'online' || normalized === 'active') return 'bg-[var(--ds-success)]';
  if (normalized === 'busy' || normalized.includes('warn')) return 'bg-[var(--ds-warning)]';
  if (normalized.includes('error') || normalized.includes('fail')) return 'bg-[var(--ds-error)]';
  return 'bg-[var(--ds-text-muted)]';
}

export function AgentsPackage() {
  const { agents, isLoading, isLive } = useAgentsPackage();
  const [query, setQuery] = useState('');
  const activeCount = agents.filter((agent) => agent.status === 'online' || agent.status === 'busy').length;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAgents = normalizedQuery
    ? agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(normalizedQuery) ||
          agent.role.toLowerCase().includes(normalizedQuery) ||
          agent.status.toLowerCase().includes(normalizedQuery),
      )
    : agents;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <PackageSubHeader
        eyebrow={`WORKFORCE · ${activeCount} ACTIVE`}
        isLive={isLive}
      />
      <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-4)] py-[var(--vestara-spacing-2)]">
        <PackageSearchInput
          id="ds-agents-filter"
          value={query}
          onChange={setQuery}
          label="Filter agents"
          placeholder="Filter agents…"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-[var(--vestara-spacing-4)]">
      {isLoading && visibleAgents.length === 0 ? (
        <PackageSkeleton count={4} label="Loading agents" />
      ) : visibleAgents.length === 0 ? (
        <PackageEmpty title="No matching agents" hint="Adjust the filter to see the workforce." />
      ) : (
      <div
        className="ds-cards grid gap-[var(--vestara-spacing-2)]"
        aria-busy={isLoading}
      >
        {visibleAgents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]"
          >
            <div className="flex items-center gap-[var(--vestara-spacing-2)]">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text-secondary)]">
                {agent.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
                  {agent.name}
                </div>
                <div className="truncate text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
                  {agent.role}
                </div>
              </div>
            </div>
            <div className="mt-[var(--vestara-spacing-2)] flex items-center gap-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${agentTone(agent.status)}`}
              />
              <span className="truncate">
                {agent.status} · {agent.model}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
      </div>
    </div>
  );
}
