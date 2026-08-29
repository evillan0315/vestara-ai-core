import { MarkdownRenderer } from './chat/MarkdownRenderer';
import { VestaraModal } from './ui/VestaraModal';

interface Execution {
  id: string;
  agentId: string;
  task: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: string;
}

interface ExecutionDetailModalProps {
  execution: Execution;
  agents: Array<{ id: string; name: string }>;
  onClose: () => void;
}

export default function ExecutionDetailModal({ execution, agents, onClose }: ExecutionDetailModalProps) {
  return (
    <VestaraModal onClose={onClose} className="max-w-lg max-h-[80vh] flex flex-col">
      <div className="flex flex-col flex-1 min-h-0 p-5">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${execution.status === 'completed' ? 'bg-green-500' : execution.status === 'failed' ? 'bg-red-500' : 'bg-amber-400'}`}
            />
            <h3 className="text-sm font-semibold text-(--vestara-text)">Execution Details</h3>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${
                execution.status === 'completed'
                  ? 'bg-green-400/10 text-green-400'
                  : execution.status === 'failed'
                    ? 'bg-red-400/10 text-red-400'
                    : 'bg-amber-400/10 text-amber-400'
              }`}
            >
              {execution.status}
            </span>
          </div>
          <button onClick={onClose} className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) text-base cursor-pointer">✕</button>
        </div>

        <div className="space-y-3 flex-1 min-h-0 pr-1 overflow-y-auto">
          <div>
            <div className="text-[9px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-1">Task</div>
            <div className="text-xs text-zinc-200 leading-relaxed bg-zinc-800/50 border border-(--vestara-accent-border)/50 rounded-lg p-3">
              {execution.task}
            </div>
          </div>

          {execution.result && (
            <div>
              <div className="text-[9px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-1">Result</div>
              <div
                className="bg-black/40 border border-(--vestara-accent-border)/60 rounded-lg p-3 max-h-64"
                style={{ overflowY: 'scroll' }}
              >
                <div className="text-xs text-(--vestara-text) leading-relaxed">
                  <MarkdownRenderer content={execution.result} />
                </div>
              </div>
            </div>
          )}

          {execution.agentId && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-600">
              <span>Agent:</span>
              <span className="text-zinc-400 font-medium">
                {agents.find((a) => a.id === execution.agentId)?.name || execution.agentId}
              </span>
              <span className="text-zinc-700">·</span>
              <span>Started:</span>
              <span className="text-zinc-400">{new Date(execution.startedAt).toLocaleString()}</span>
              {execution.completedAt && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>Completed:</span>
                  <span className="text-zinc-400">{new Date(execution.completedAt).toLocaleString()}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </VestaraModal>
  );
}
