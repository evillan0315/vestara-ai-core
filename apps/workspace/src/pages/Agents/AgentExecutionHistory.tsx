import { useMemo, useState } from 'react';
import Pagination from '../../components/Pagination';
import type { Execution } from './types';

const EXEC_PAGE_SIZE = 6;

interface AgentExecutionHistoryProps {
  executions: Execution[];
  onOpenExecution: (execution: Execution) => void;
}

export default function AgentExecutionHistory({ executions, onOpenExecution }: AgentExecutionHistoryProps) {
  const [executionFilter, setExecutionFilter] = useState('all');
  const [execPage, setExecPage] = useState(1);

  const filteredAgentExecs = useMemo(() => {
    if (executionFilter === 'all') return executions;
    return executions.filter((e) => e.status === executionFilter);
  }, [executions, executionFilter]);

  return (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider">
          Tasks ({executions.length})
        </div>
        <select
          value={executionFilter}
          onChange={(e) => setExecutionFilter(e.target.value)}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md text-[9px] px-1.5 py-0.5 outline-none cursor-pointer"
        >
          <option value="all">All</option>
          <option value="completed">Done</option>
          <option value="failed">Failed</option>
          <option value="running">Active</option>
        </select>
      </div>

      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {filteredAgentExecs.length === 0 && (
          <p className="text-[10px] text-(--vestara-text-dim) py-2 text-center italic">No executions</p>
        )}
        {filteredAgentExecs.slice((execPage - 1) * EXEC_PAGE_SIZE, execPage * EXEC_PAGE_SIZE).map((ex) => {
          const duration = ex.completedAt
            ? Math.round((new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000)
            : null;
          return (
            <div
              key={ex.id}
              onClick={() => onOpenExecution(ex)}
              className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-(--vestara-accent-bg) transition-colors text-[10px] cursor-pointer"
            >
              <span
                className={`shrink-0 ${ex.status === 'completed' ? 'text-green-500' : ex.status === 'failed' ? 'text-red-500' : 'text-amber-400'}`}
              >
                {ex.status === 'completed' ? '✔' : ex.status === 'failed' ? '✗' : '◉'}
              </span>
              <span className="text-(--vestara-text) truncate flex-1">{ex.task}</span>
              <span className="text-(--vestara-text-muted) shrink-0">
                {new Date(ex.startedAt).toLocaleTimeString()} {duration !== null && `· ${duration}s`}
              </span>
              <span
                className={`text-[8px] px-1 py-0.5 rounded uppercase font-medium ${ex.status === 'completed' ? 'bg-green-400/10 text-green-400' : ex.status === 'failed' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'}`}
              >
                {ex.status}
              </span>
            </div>
          );
        })}
      </div>

      {filteredAgentExecs.length > EXEC_PAGE_SIZE && (
        <div className="border-t border-(--vestara-accent-border) pt-1.5 mt-1.5">
          <Pagination
            current={execPage}
            total={filteredAgentExecs.length}
            pageSize={EXEC_PAGE_SIZE}
            onChange={setExecPage}
          />
        </div>
      )}
    </>
  );
}
