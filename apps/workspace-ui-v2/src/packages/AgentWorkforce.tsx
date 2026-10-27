import { useEffect, useState } from 'react';
import { fetchAgents, type LiveAgent, mergeAgentsWithCanonical } from '../lib/agents';
import { AGENT_WORKFORCE_FIXTURE, AGENT_WORKFORCE_OFFLINE_NOTE } from './agent.fixtures';

function isActive(status: string): boolean {
  return status === 'online' || status === 'busy' || status === 'active' || status === 'running';
}

export function AgentPkg() {
  const [agents, setAgents] = useState<readonly LiveAgent[]>(AGENT_WORKFORCE_FIXTURE);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAgents()
      .then((live) => {
        if (cancelled) return;
        // Canonical v1 roster always rendered; live API status overlays it.
        setAgents(mergeAgentsWithCanonical(AGENT_WORKFORCE_FIXTURE, live));
        if (live.length > 0) setIsLive(true);
      })
      .catch(() => {
        if (!cancelled) setIsLive(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = agents.filter((a) => isActive(a.status)).length;

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        <span>WORKFORCE • {activeCount} ACTIVE</span>
        <span
          className={`rounded-full border px-2 py-px ${
            isLive
              ? 'border-[var(--vestara-status-shell-success)]/20 bg-[var(--vestara-status-shell-success)]/10 text-[var(--vestara-status-shell-success)]'
              : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-canvas)] text-[var(--vestara-text-shell-muted)]'
          }`}
        >
          {isLive ? 'LIVE' : 'SNAPSHOT'}
        </span>
      </div>
      {!isLive && !isLoading && (
        <div className="mt-2 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-faint)]">
          {AGENT_WORKFORCE_OFFLINE_NOTE}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2" aria-busy={isLoading}>
        {agents.map((a) => (
          <div
            key={a.id}
            className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive(a.status)
                    ? 'bg-[var(--vestara-status-shell-success)]'
                    : 'bg-[var(--vestara-text-shell-muted)]'
                }`}
              />
              <span className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
                {a.name}
              </span>
            </div>
            <div className="mt-1 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-muted)]">
              {a.role} • {a.status}
              {a.provider ? ` • ${a.provider}` : ''} • {a.model}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
