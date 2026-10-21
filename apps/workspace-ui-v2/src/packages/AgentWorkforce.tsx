import { AGENT_ACTIVE_COUNT, AGENT_NAMES } from './agent.fixtures';

export function AgentPkg() {
  return (
    <div className="p-4">
      <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        WORKFORCE • {AGENT_ACTIVE_COUNT} ACTIVE
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AGENT_NAMES.map((n) => (
          <div
            key={n}
            className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]"
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
