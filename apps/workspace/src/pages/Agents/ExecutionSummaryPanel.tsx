import type { ExecutionSummary } from './types';

interface ExecutionSummaryPanelProps {
  execSummary: ExecutionSummary;
  executionsCount: number;
}

export default function ExecutionSummaryPanel({ execSummary, executionsCount }: ExecutionSummaryPanelProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-green-500/60" /> Execution Summary
      </h3>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Completed</span>
          <span className="text-green-400 font-medium">{execSummary.completed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Failed</span>
          <span className="text-red-400 font-medium">{execSummary.failed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Running</span>
          <span className="text-amber-400 font-medium">{execSummary.running}</span>
        </div>
        {executionsCount > 0 && (
          <div className="pt-1">
            <div className="w-full bg-(--vestara-accent-bg) rounded-full h-2 flex overflow-hidden">
              <div
                className="h-2 bg-green-500 transition-all"
                style={{ width: `${(execSummary.completed / execSummary.total) * 100}%` }}
              />
              <div
                className="h-2 bg-red-500 transition-all"
                style={{ width: `${(execSummary.failed / execSummary.total) * 100}%` }}
              />
              <div
                className="h-2 bg-amber-400 transition-all"
                style={{ width: `${(execSummary.running / executionsCount) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-(--vestara-text-dim) mt-1">
              <span>{execSummary.total} finished</span>
              <span>{execSummary.successRate}% success</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
