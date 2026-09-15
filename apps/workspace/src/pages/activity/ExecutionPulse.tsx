import type { WorkflowParticipant } from './activity-types';

// Semantic mapping (spec §5): running work is blue (info), completion is
// green (success), planning/warm states amber, failures red, queued muted.
// Canonical --vestara-status-* tokens only — never raw hex.
const STATE_DOT: Record<string, string> = {
  completed: 'bg-[var(--vestara-status-success)]',
  failed: 'bg-[var(--vestara-status-error)]',
  cancelled: 'bg-[var(--vestara-status-error)]',
  blocked: 'bg-[var(--vestara-status-error)]',
  active: 'bg-[var(--vestara-status-info)]',
  running: 'bg-[var(--vestara-status-info)]',
  reasoning: 'bg-[var(--vestara-status-warning)]',
  preparing: 'bg-[var(--vestara-status-warning)]',
  waiting: 'bg-[var(--vestara-text-dim)]',
  queued: 'bg-[var(--vestara-text-dim)]',
};

const RUNNING = new Set(['active', 'reasoning', 'preparing', 'running']);

/**
 * Compact execution pulse — a thin lifecycle indicator showing each workflow
 * stage and its current state. Not a graph explorer; just "what is happening".
 */
export default function ExecutionPulse({ participants }: { participants: readonly WorkflowParticipant[] }) {
  if (participants.length === 0) return null;
  const currentIndex = participants.findIndex((p) => RUNNING.has(p.executionState));
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-3 py-1.5">
      {participants.map((p, index) => {
        const active = p.executionState === 'active' || p.executionState === 'reasoning' || p.executionState === 'preparing';
        const done = p.executionState === 'completed';
        return (
          <div key={p.threadId} className="flex items-center gap-1">
            {index > 0 && <span className="text-[10px] text-[var(--vestara-text-dim)]">—</span>}
            <span
              className={`flex items-center gap-1 text-[10px] ${
                index === currentIndex ? 'text-[var(--vestara-text)]' : done ? 'text-[var(--vestara-text-secondary)]' : 'text-[var(--vestara-text-muted)]'
              }`}
              title={`${p.agentId} · ${p.executionState}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[p.executionState] ?? 'bg-[var(--vestara-text-dim)]'} ${
                  active ? 'animate-pulse' : ''
                }`}
              />
              <span className="whitespace-nowrap font-medium">{p.role[0].toUpperCase() + p.role.slice(1)}</span>
              {done && <span className="text-[var(--vestara-status-success)]">✓</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
