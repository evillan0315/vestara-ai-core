/**
 * VES-OVERVIEW-001: System Status (merged Agents + System)
 *
 * Single status card replacing two single-line SectionCards. Preserves the
 * "Agents" and "System" subheadings plus their shell links so existing
 * surfaces keep working, and upgrades resources with mini usage bars.
 */

import { Link } from 'react-router-dom';
import type { OverviewAgentSummary, OverviewResourceSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface SystemStatusProps {
  agents: readonly OverviewAgentSummary[];
  resources: OverviewResourceSummary;
}

const STATUS_LABEL: Record<string, string> = {
  online: 'online',
  working: 'busy',
  busy: 'busy',
  idle: 'idle',
  offline: 'offline',
};

function agentSummary(agents: readonly OverviewAgentSummary[]): string {
  const counts: Record<string, number> = {};
  for (const agent of agents) {
    const label = STATUS_LABEL[agent.status] ?? 'idle';
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const parts: string[] = [`${agents.length} agent${agents.length === 1 ? '' : 's'}`];
  for (const [status, count] of Object.entries(counts)) {
    if (count > 0) parts.push(`${count} ${status}`);
  }
  return parts.join(' · ');
}

export function SystemStatus({ agents, resources }: SystemStatusProps) {
  const bars = [
    { label: 'CPU', value: `${resources.cpu}%`, pct: resources.cpu, color: 'var(--vestara-status-info)', detail: resources.cpuDetail },
    { label: 'Mem', value: `${resources.memory}%`, pct: resources.memory, color: 'var(--vestara-status-warning)', detail: resources.memoryDetail },
    { label: 'Disk', value: `${resources.disk ?? 0}%`, pct: resources.disk ?? 0, color: 'var(--vestara-status-success)', detail: resources.diskDetail },
  ];
  const summary = agentSummary(agents);
  const hasOnline = agents.some((a) => a.status === 'online' || a.status === 'working' || a.status === 'busy');

  return (
    <SectionCard title="System status" accent="var(--vestara-status-success)" index={3}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-[var(--vestara-text-primary)]">Agents</h3>
        <Link to="/agents" className="mpg-link">
          View All<span aria-hidden="true"> ›</span>
        </Link>
      </div>
      {agents.length === 0 ? (
        <p className="py-2 text-center text-[12px] text-[var(--vestara-text-muted)]">No agents registered.</p>
      ) : (
        <Link
          to="/agents"
          className="mpg-category-row text-[12.5px] text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: hasOnline ? 'var(--vestara-status-success)' : 'var(--vestara-text-muted)',
                boxShadow: hasOnline ? '0 0 6px var(--vestara-status-success)' : 'none',
              }}
            />
            {summary}
          </span>
          <span className="text-[var(--vestara-text-muted)]">›</span>
        </Link>
      )}

      <div className="my-3 border-t border-[var(--vestara-border-subtle)]" aria-hidden="true" />

      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-[var(--vestara-text-primary)]">System</h3>
        <Link to="/diagnostics" className="mpg-link">
          Details<span aria-hidden="true"> ›</span>
        </Link>
      </div>
      <div className="space-y-2">
        {bars.map((item) => (
          <div key={item.label} title={item.detail ?? `${item.label} ${item.value}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                <span className="text-[var(--vestara-text-muted)]">{item.label}</span>
              </span>
              <span className="font-medium tabular-nums text-[var(--vestara-text-secondary)]">{item.value}</span>
            </div>
            <div
              className="mt-1 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--vestara-text-muted)_18%,transparent)]"
              role="progressbar"
              aria-valuenow={Math.round(item.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${item.label} usage ${item.value}`}
            >
              <span
                className="block h-full rounded-[inherit]"
                style={{ width: `${Math.min(100, Math.max(0, item.pct))}%`, background: item.color }}
              />
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--vestara-text-muted)]">
          {resources.networkDetail && <span>↑↓ {resources.networkDetail}</span>}
          {resources.uptime && <span>{resources.uptime} up</span>}
        </div>
      </div>
    </SectionCard>
  );
}
