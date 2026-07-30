import { useState } from 'react';
import Pagination from '../../components/Pagination';
import type { Execution, Agent } from '../OpsCenter';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? '#10b981' : status === 'failed' ? '#ef4444' : status === 'running' || status === 'queued' ? '#f59e0b' : '#6b7280';
  return <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />;
}

interface ExecutionsListProps {
  executions: Execution[];
  agents: Agent[];
  formatDuration: (seconds: number) => string;
  setSelectedExecution: (e: Execution | null) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function ExecutionsList({ executions, agents, formatDuration, setSelectedExecution, page, pageSize, onPageChange }: ExecutionsListProps) {
  const start = (page - 1) * pageSize;
  const display = executions.slice(start, start + pageSize);

  if (executions.length === 0) {
    return (
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider">Executions</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-lg mb-1 opacity-30">◉</div>
          <p className="text-xs text-(--vestara-text-2)">No executions yet</p>
          <p className="text-[10px] text-(--vestara-text-dim) mt-1">Start a workflow or run an agent to see execution history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider">Executions ({executions.length})</h3>
      </div>
      <div className="overflow-y-auto min-h-0 flex-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-(--vestara-text-muted) border-b border-(--vestara-accent-border)">
              <th className="text-left py-1.5 px-2 font-medium">Agent</th>
              <th className="text-left py-1.5 px-2 font-medium">Task</th>
              <th className="text-left py-1.5 px-2 font-medium">Started</th>
              <th className="text-left py-1.5 px-2 font-medium">Duration</th>
              <th className="text-left py-1.5 px-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="overflow-y-auto">
            {display.map((exec, i) => {
              const agent = agents.find((a) => a.id === exec.agentId || a.name.toLowerCase().includes(exec.agentId.split('-').pop()?.toLowerCase() || ''));
              const startDate = new Date(exec.startedAt);
              const duration = exec.completedAt
                ? formatDuration(Math.round((new Date(exec.completedAt).getTime() - startDate.getTime()) / 1000))
                : exec.status === 'running'
                  ? formatDuration(Math.round((Date.now() - startDate.getTime()) / 1000))
                  : null;
              return (
                <tr key={exec.id || i} onClick={() => setSelectedExecution(exec)} className="border-b border-(--vestara-accent-border)/50 hover:bg-(--vestara-accent-bg) cursor-pointer transition-colors">
                  <td className="py-1.5 px-2 text-(--vestara-text)">{agent?.name || exec.agentId}</td>
                  <td className="py-1.5 px-2 text-(--vestara-text) truncate max-w-xs">{exec.task}</td>
                  <td className="py-1.5 px-2 text-(--vestara-text-2)">{formatRelativeTime(exec.startedAt)}</td>
                  <td className="py-1.5 px-2 text-(--vestara-text-2)">{duration || '--'}</td>
                  <td className="py-1.5 px-2"><StatusDot status={exec.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
        <Pagination current={page} total={executions.length} pageSize={pageSize} onChange={onPageChange} />
      </div>
    </div>
  );
}
