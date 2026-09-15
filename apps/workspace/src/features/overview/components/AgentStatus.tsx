/**
 * VES-OVERVIEW-001: Agent Status Component
 *
 * Compact single-row summary: "5 agents · 3 online · 2 idle"
 * with a link to the full agents page.
 */

import { Link } from 'react-router-dom';
import type { OverviewAgentSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface AgentStatusProps {
  agents: readonly OverviewAgentSummary[];
}

const STATUS_LABEL: Record<string, string> = {
  online: 'online',
  working: 'busy',
  busy: 'busy',
  idle: 'idle',
  offline: 'offline',
};

export function AgentStatus({ agents }: AgentStatusProps) {
  if (agents.length === 0) {
    return (
      <SectionCard title="Agents" actionLabel="View All" actionHref="/agents" accent="var(--vestara-accent-primary)" index={2}>
        <p className="py-2 text-center text-[12px] text-[var(--vestara-text-muted)]">No agents registered.</p>
      </SectionCard>
    );
  }

  const counts: Record<string, number> = {};
  for (const agent of agents) {
    const label = STATUS_LABEL[agent.status] ?? 'idle';
    counts[label] = (counts[label] ?? 0) + 1;
  }

  const summaryParts: string[] = [];
  summaryParts.push(`${agents.length} agent${agents.length === 1 ? '' : 's'}`);
  for (const [status, count] of Object.entries(counts)) {
    if (count > 0) summaryParts.push(`${count} ${status}`);
  }

  return (
    <SectionCard title="Agents" actionLabel="View All" actionHref="/agents" accent="var(--vestara-accent-primary)" index={2}>
      <Link
        to="/agents"
        className="mpg-category-row text-[12.5px] text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: counts.online ? 'var(--vestara-status-success)' : 'var(--vestara-text-muted)',
              boxShadow: counts.online ? '0 0 6px var(--vestara-status-success)' : 'none',
            }}
          />
          {summaryParts.join(' · ')}
        </span>
        <span className="text-[var(--vestara-text-muted)]">›</span>
      </Link>
    </SectionCard>
  );
}
