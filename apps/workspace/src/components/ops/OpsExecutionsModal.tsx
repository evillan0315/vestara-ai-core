import type { Agent, Execution } from '../../pages/OpsCenter';

interface OpsExecutionsModalProps {
  execution: Execution;
  agents: Agent[];
  onClose: () => void;
  formatDuration: (seconds: number) => string;
}

export default function OpsExecutionsModal({ execution, agents, onClose, formatDuration }: OpsExecutionsModalProps) {
  const agent = agents.find(
    (a) =>
      a.id === execution.agentId ||
      a.name.toLowerCase().includes(execution.agentId.split('-').pop()?.toLowerCase() || ''),
  );
  const duration = execution.completedAt
    ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-700)] rounded-xl p-5 w-full max-w-4xl mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-zinc-200)]">Execution Details</h3>
          <button
            onClick={onClose}
            className="text-[var(--color-zinc-600)] hover:text-[var(--color-zinc-400)] text-base cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 flex-1 pr-1" style={{ overflowY: 'scroll' }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Agent</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">{agent?.name || execution.agentId}</div>
            </div>
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Status</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">{execution.status}</div>
            </div>
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Started</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">
                {new Date(execution.startedAt).toLocaleString()}
              </div>
            </div>
            {execution.completedAt && (
              <div>
                <span className="text-[var(--color-zinc-600)] text-[10px]">Completed</span>
                <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">
                  {new Date(execution.completedAt).toLocaleString()}
                </div>
              </div>
            )}
            <div>
              <span className="text-[var(--color-zinc-600)] text-[10px]">Duration</span>
              <div className="text-[var(--color-zinc-300)] text-[11px] mt-0.5">
                {duration !== null ? formatDuration(duration) : '--'}
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-[var(--color-zinc-700)]">
            <div className="text-[9px] font-semibold text-[var(--color-zinc-500)] uppercase tracking-wider mb-1.5">
              Task
            </div>
            <div className="text-xs text-[var(--color-zinc-300)] leading-relaxed bg-[var(--color-zinc-800)]/50 border border-[var(--color-zinc-700)]/50 rounded-lg p-3">
              {execution.task}
            </div>
          </div>
          {execution.result && (
            <div className="pt-2 border-t border-[var(--color-zinc-700)]">
              <div className="text-[9px] font-semibold text-[var(--color-zinc-500)] uppercase tracking-wider mb-1.5">
                Result
              </div>
              <div
                className="text-xs text-[var(--color-zinc-300)] leading-relaxed bg-[var(--color-zinc-800)]/50 border border-[var(--color-zinc-700)]/50 rounded-lg p-3 max-h-48"
                style={{ overflowY: 'scroll' }}
              >
                {JSON.stringify(execution.result, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
