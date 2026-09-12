/**
 * VES-OVERVIEW-001: Agent Status Component
 *
 * Marketplace rows (mpg-category-row) with agent tiles, roles, and
 * glowing status pills (Online / Busy / Idle / Offline).
 */

import { MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewAgentSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface AgentStatusProps {
  agents: readonly OverviewAgentSummary[];
}

const STATUS_META = {
  online: { color: 'var(--ov-presence-online)', label: 'Online' },
  working: { color: 'var(--ov-presence-busy)', label: 'Busy' },
  busy: { color: 'var(--ov-presence-busy)', label: 'Busy' },
  idle: { color: 'var(--ov-presence-idle)', label: 'Idle' },
  offline: { color: 'var(--ov-presence-offline)', label: 'Offline' },
} as const;

const TILE_ACCENT = [
  'var(--vestara-status-info)',
  'var(--vestara-accent-primary)',
  'var(--vestara-status-success)',
  'var(--vestara-status-warning)',
  'var(--vestara-status-error)',
];

export function AgentStatus({ agents }: AgentStatusProps) {
  if (agents.length === 0) {
    return (
      <SectionCard title="Agents Status" actionLabel="View All" actionHref="/agents" accent="var(--vestara-accent-primary)" index={2}>
        <MarketplaceEmptyState message="No agents registered." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Agents Status" actionLabel="View All" actionHref="/agents" accent="var(--vestara-accent-primary)" index={2}>
      <ul className="space-y-1">
        {agents.map((agent, i) => {
          const meta = STATUS_META[agent.status] ?? STATUS_META.idle;
          const accent = TILE_ACCENT[i % TILE_ACCENT.length];
          return (
            <li key={agent.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="mpg-category-row">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="mpg-icon-box"
                    style={{
                      color: accent,
                      background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                      width: '2rem',
                      height: '2rem',
                      fontSize: '0.85rem',
                      borderRadius: '0.5rem',
                    }}
                  >
                    {agent.id === 'developer' ? '</>' : agent.id === 'reviewer' ? '◈' : agent.id === 'ops' ? '⚙' : agent.id === 'verifier' ? '✓' : '⬢'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {agent.name}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{agent.role}</span>
                  </span>
                </span>
                <span
                  className="mpg-tag-pill shrink-0 font-medium"
                  style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
                  />
                  {meta.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
