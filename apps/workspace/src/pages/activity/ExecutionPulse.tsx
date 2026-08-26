import type { WorkflowParticipant } from './activity-types';

const STATE_DOT: Record<string, string> = {
  completed: 'bg-(--vestara-green)',
  failed: 'bg-(--vestara-red)',
  cancelled: 'bg-(--vestara-red)',
  blocked: 'bg-(--vestara-red)',
  active: 'bg-(--vestara-green)',
  reasoning: 'bg-(--vestara-amber)',
  preparing: 'bg-(--vestara-amber)',
  waiting: 'bg-(--vestara-text-dim)',
  queued: 'bg-(--vestara-text-dim)',
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
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5">
      {participants.map((p, index) => {
        const active = p.executionState === 'active' || p.executionState === 'reasoning' || p.executionState === 'preparing';
        const done = p.executionState === 'completed';
        return (
          <div key={p.threadId} className="flex items-center gap-1">
            {index > 0 && <span className="text-[9px] text-(--vestara-text-dim)">—</span>}
            <span
              className={`flex items-center gap-1 text-[9px] ${
                index === currentIndex ? 'text-(--vestara-text)' : done ? 'text-(--vestara-text-2)' : 'text-(--vestara-text-muted)'
              }`}
              title={`${p.agentId} · ${p.executionState}`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[p.executionState] ?? 'bg-(--vestara-text-dim)'} ${
                  active ? 'animate-pulse' : ''
                }`}
              />
              <span className="whitespace-nowrap font-medium">{p.role[0].toUpperCase() + p.role.slice(1)}</span>
              {done && <span className="text-(--vestara-green)">✓</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
