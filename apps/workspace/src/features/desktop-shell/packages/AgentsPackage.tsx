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

import { useAgentsPackage } from './useAgentsPackage';
import '../desktop-shell.tokens.css';

export function AgentsPackage() {
  const { agents, isLoading, isLive } = useAgentsPackage();
  const activeCount = agents.filter((agent) => agent.status === 'online' || agent.status === 'busy').length;

  return (
    <div className="p-[var(--vestara-spacing-4)]">
      <div className="flex items-center gap-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
        <span>WORKFORCE · {activeCount} ACTIVE</span>
        <span
          className={`rounded-full border px-[var(--vestara-spacing-2)] py-px ${
            isLive
              ? 'border-[var(--ds-success)] bg-[var(--ds-success-bg)] text-[var(--ds-success)]'
              : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)]'
          }`}
        >
          {isLive ? 'LIVE' : 'SNAPSHOT'}
        </span>
      </div>
      <div
        className="mt-[var(--vestara-spacing-3)] grid grid-cols-2 gap-[var(--vestara-spacing-2)]"
        aria-busy={isLoading}
      >
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] p-[var(--vestara-spacing-3)]"
          >
            <div className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">
              {agent.name}
            </div>
            <div className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
              {agent.role}
            </div>
            <div className="mt-[var(--vestara-spacing-2)] flex items-center gap-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  agent.status === 'online' || agent.status === 'busy'
                    ? 'bg-[var(--ds-success)]'
                    : 'bg-[var(--ds-text-muted)]'
                }`}
              />
              <span>
                {agent.status} · {agent.model}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
