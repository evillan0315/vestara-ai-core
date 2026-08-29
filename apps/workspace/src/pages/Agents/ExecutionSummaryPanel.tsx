import { useMemo } from 'react';
import type { Execution, ExecutionSummary } from './types';

interface ExecutionSummaryPanelProps {
  execSummary: ExecutionSummary;
  executionsCount: number;
  executions: Execution[];
}

interface Trend {
  direction: 'up' | 'down' | 'flat';
  pct: number;
  label: string;
}

function computeTrend(current: number, previous: number): Trend {
  if (previous === 0 && current === 0) return { direction: 'flat', pct: 0, label: '—' };
  if (previous === 0) return { direction: 'up', pct: 100, label: '+100%' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { direction: 'up', pct, label: `+${pct}%` };
  if (pct < 0) return { direction: 'down', pct: Math.abs(pct), label: `${pct}%` };
  return { direction: 'flat', pct: 0, label: '—' };
}

function TrendIndicator({ trend, positive }: { trend: Trend; positive?: boolean }) {
  if (trend.label === '—') {
    return <span className="text-[9px] text-(--vestara-text-dim)">—</span>;
  }
  const color =
    trend.direction === 'flat'
      ? 'text-(--vestara-text-dim)'
      : positive
        ? trend.direction === 'up'
          ? 'text-green-400'
          : 'text-red-400'
        : trend.direction === 'up'
          ? 'text-red-400'
          : 'text-green-400';
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
  return (
    <span className={`text-[9px] font-medium ${color}`}>
      {arrow} {trend.label}
    </span>
  );
}

export default function ExecutionSummaryPanel({ execSummary, executionsCount, executions }: ExecutionSummaryPanelProps) {
  const trends = useMemo(() => {
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const recent = executions.filter((e) => now - new Date(e.startedAt).getTime() < h24);
    const prior = executions.filter((e) => {
      const age = now - new Date(e.startedAt).getTime();
      return age >= h24 && age < h24 * 2;
    });
    return {
      completed: computeTrend(
        recent.filter((e) => e.status === 'completed').length,
        prior.filter((e) => e.status === 'completed').length,
      ),
      failed: computeTrend(
        recent.filter((e) => e.status === 'failed').length,
        prior.filter((e) => e.status === 'failed').length,
      ),
      running: computeTrend(
        recent.filter((e) => e.status === 'running').length,
        prior.filter((e) => e.status === 'running').length,
      ),
      successRate: computeTrend(
        recent.length > 0 ? recent.filter((e) => e.status === 'completed').length / recent.length : 0,
        prior.length > 0 ? prior.filter((e) => e.status === 'completed').length / prior.length : 0,
      ),
    };
  }, [executions]);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <h3 className="text-[10px] font-semibold text-(--vestara-text-2) uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-green-500/60" /> Execution Summary
      </h3>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Completed</span>
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-medium">{execSummary.completed}</span>
            <TrendIndicator trend={trends.completed} positive />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Failed</span>
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-medium">{execSummary.failed}</span>
            <TrendIndicator trend={trends.failed} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-(--vestara-text-muted)">Running</span>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-medium">{execSummary.running}</span>
            <TrendIndicator trend={trends.running} />
          </div>
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
              <div className="flex items-center gap-1.5">
                <span>{execSummary.successRate}% success</span>
                <TrendIndicator trend={trends.successRate} positive />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
