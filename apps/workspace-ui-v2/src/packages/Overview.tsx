import { useEffect, useState } from 'react';
import { fetchAgents, type LiveAgent, mergeAgentsWithCanonical } from '../lib/agents';
import { fetchOverviewHealth, type OverviewHealth } from '../lib/overview';
import { AGENT_WORKFORCE_FIXTURE } from './agent.fixtures';
import { OVERVIEW_GREETING, OVERVIEW_OFFLINE_NOTE, OVERVIEW_STATS, type OverviewStat } from './overview.fixtures';

type LoadState = 'loading' | 'live' | 'fixture';

function isActive(status: string): boolean {
  return status === 'online' || status === 'busy' || status === 'active' || status === 'running';
}

export function OverviewPkg() {
  const [agents, setAgents] = useState<readonly LiveAgent[]>(AGENT_WORKFORCE_FIXTURE);
  const [health, setHealth] = useState<OverviewHealth>('healthy');
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [liveAgents, liveHealth] = await Promise.all([fetchAgents(), fetchOverviewHealth()]);
        if (cancelled) return;
        // Canonical v1 roster always rendered; live API status overlays it.
        setAgents(mergeAgentsWithCanonical(AGENT_WORKFORCE_FIXTURE, liveAgents));
        setHealth(liveHealth);
        setState(liveAgents.length > 0 ? 'live' : 'fixture');
      } catch {
        if (!cancelled) setState('fixture');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = agents.filter((a) => isActive(a.status)).length;
  const subtitle = `Vestara Platform • ${agents.length} agents • ${activeCount} active • All systems ${health === 'healthy' ? 'nominal' : 'degraded'}`;

  const stats: OverviewStat[] = OVERVIEW_STATS.map((s) => {
    if (s.key === 'AGENTS') return { key: s.key, value: `${activeCount}/${agents.length}` };
    if (s.key === 'HEALTH') return { key: s.key, value: health === 'healthy' ? 'Healthy' : 'Degraded' };
    return s;
  });

  return (
    <div className="p-4 space-y-3">
      <div className="rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--vestara-font-size-caption)] tracking-[0.2em] text-[var(--vestara-text-shell-muted)]">
            WORKSPACE OVERVIEW
          </span>
          <span
            className={`text-[length:var(--vestara-font-size-caption)] px-1.5 py-0.5 rounded border ${
              health === 'healthy'
                ? 'bg-[var(--vestara-status-shell-success)]/10 border-[var(--vestara-status-shell-success)]/20 text-[var(--vestara-status-shell-success)]'
                : 'bg-[var(--vestara-status-shell-warning)]/10 border-[var(--vestara-status-shell-warning)]/20 text-[var(--vestara-status-shell-warning)]'
            }`}
          >
            {health === 'healthy' ? 'HEALTHY' : 'DEGRADED'}
          </span>
          <span
            className={`ml-auto text-[length:var(--vestara-font-size-micro-small)] font-mono px-1.5 py-0.5 rounded-full border ${
              state === 'live'
                ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
                : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-muted)]'
            }`}
          >
            {state === 'live' ? 'LIVE' : state === 'loading' ? '…' : 'SNAPSHOT'}
          </span>
        </div>
        <div className="mt-1 text-[length:var(--vestara-font-size-title-large)] leading-[0.9] tracking-[-0.02em] text-[var(--vestara-text-shell-primary)] font-[family-name:var(--vestara-font-family-display)]">
          {OVERVIEW_GREETING}
        </div>
        <div className="mt-1 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-secondary)]">
          {subtitle}
        </div>
        {state === 'fixture' && (
          <div className="mt-1 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)]">
            {OVERVIEW_OFFLINE_NOTE}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stats.map((c) => (
          <div
            key={c.key}
            className="bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] rounded-[var(--vestara-radius-md-plus)] px-3 py-2"
          >
            <div className="text-[length:var(--vestara-font-size-micro)] tracking-[0.15em] text-[var(--vestara-text-shell-muted)]">
              {c.key}
            </div>
            <div className="text-[length:var(--vestara-font-size-body-small)] font-medium text-[var(--vestara-text-shell-primary)]">
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
        <div className="text-[length:var(--vestara-font-size-micro)] tracking-[0.15em] text-[var(--vestara-text-shell-muted)]">
          AGENTS • {activeCount}/{agents.length} ACTIVE
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agents.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 text-[length:var(--vestara-font-size-caption)] font-mono px-2 py-1 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)]"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${isActive(a.status) ? 'bg-[var(--vestara-status-shell-success)]' : 'bg-[var(--vestara-text-shell-muted)]'}`}
              />
              {a.name} • {a.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
