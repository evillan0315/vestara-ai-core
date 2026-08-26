import { useMemo, useState } from 'react';
import { useToasts } from '../../components/Toast';
import { harnessApi } from '../../lib/agent-harness';
import AgentExecutionHistory from './AgentExecutionHistory';
import AgentHarnessSessions from './AgentHarnessSessions';
import { AgentStatusBadge } from './AgentStatusBadge';
import { getAgentColor } from './constants';
import type { Agent, AgentStats, Execution, HarnessSessionEntry, Team } from './types';

const TERMINAL_STATES = ['completed', 'failed', 'blocked', 'cancelled'];

async function pollHarnessThread(threadId: string, timeoutMs: number): Promise<{ state: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await harnessApi.thread(threadId);
    if (snapshot && TERMINAL_STATES.includes(snapshot.state)) return { state: snapshot.state };
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error('Timed out waiting for harness run');
}

interface AgentCardProps {
  agent: Agent;
  isExpanded: boolean;
  team?: Team;
  stats: AgentStats;
  executions: Execution[];
  harnessSessions: HarnessSessionEntry[];
  onToggle: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onOpenExecution: (execution: Execution) => void;
  onLoad: () => void;
}

export function AgentCard({
  agent,
  isExpanded,
  team,
  stats,
  executions,
  harnessSessions,
  onToggle,
  onEdit,
  onToggleStatus,
  onDelete,
  onOpenExecution,
  onLoad,
}: AgentCardProps) {
  const { addToast } = useToasts();
  const [runTask, setRunTask] = useState('');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  const agentExecutions = useMemo(
    () =>
      executions.filter(
        (e) =>
          e.agentId === agent.id ||
          agent.name.toLowerCase().includes(e.agentId.split('-').pop()?.toLowerCase() || '') ||
          e.agentId.includes(agent.role),
      ),
    [agent, executions],
  );

  const runAgent = async () => {
    if (!runTask.trim()) return;
    setRunning(true);
    setRunOutput(null);
    try {
      // Harness execution path: a durable thread + ExecutionSession are created
      // immediately; progress flows through the harness event stream.
      const created = await harnessApi.createRun(agent.id, { instruction: runTask });
      if (!created?.threadId) throw new Error('Harness run not created');
      const terminal = await pollHarnessThread(created.threadId, 120_000);
      const detail = await harnessApi.thread(created.threadId);
      const sessionId =
        detail?.session && typeof (detail.session as { id?: unknown }).id === 'string'
          ? (detail.session as { id: string }).id
          : undefined;
      setRunOutput(
        `Harness run ${terminal.state}${sessionId ? ` · session ${sessionId}` : ''} · thread ${created.threadId.slice(0, 12)}…`,
      );
      onLoad();
      addToast({ type: 'success', message: `Harness run ${terminal.state}` });
    } catch (err: any) {
      setRunOutput(`Error: ${err.message}`);
      addToast({ type: 'error', message: `Failed to run task: ${err.message}` });
    }
    setRunning(false);
  };

  const isRegistered = agent.status !== 'unregistered';
  const color = getAgentColor(agent);

  return (
    <div
      className={`rounded-lg border transition-all ${isExpanded ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active)' : isRegistered ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) hover:border-(--vestara-accent-border-active)' : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border)/50 opacity-60'}`}
      style={{
        borderLeftColor: isRegistered ? color : undefined,
        borderLeftWidth: isRegistered ? '3px' : undefined,
      }}
    >
      {/* Header row */}
      <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => isRegistered && onToggle()}>
        <div className="relative shrink-0">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: isRegistered ? (agent.status === 'active' ? color : '#52525b') : '#27272a',
            }}
          />
          {stats.running > 0 && (
            <div
              className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40"
              style={{ backgroundColor: color }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold truncate ${isRegistered ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'}`}
            >
              {agent.name}
            </span>
            <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium shrink-0">
              {agent.role}
            </span>
            <AgentStatusBadge status={agent.status} />
          </div>
          {agent.description && (
            <div
              className={`text-[10px] truncate mt-0.5 ${isRegistered ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text-dim)'}`}
            >
              {agent.description}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {agent.provider && <span className="text-[9px] text-(--vestara-text-dim)">{agent.provider}</span>}
            {agent.model && <span className="text-[9px] text-(--vestara-text-dim) font-mono">{agent.model}</span>}
            {stats.total > 0 && (
              <span className="text-[9px] text-(--vestara-text-dim)">
                {stats.completed}/{stats.total} tasks
              </span>
            )}
            {stats.running > 0 && (
              <span className="text-[9px] text-amber-400 animate-pulse font-semibold">{stats.running} running</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
          >
            {isRegistered ? 'Edit' : 'Register'}
          </button>
          {isRegistered && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus();
                }}
                className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
              >
                {agent.status === 'active' ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-[9px] px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-red-400 rounded-md hover:bg-red-400/10 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats.total > 0 && (
        <div className="px-3 pb-2">
          <div className="flex-1 bg-(--vestara-accent-bg) rounded-full h-1.5 flex overflow-hidden">
            {stats.completed > 0 && (
              <div
                className="h-1.5 bg-green-500 transition-all"
                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
              />
            )}
            {stats.failed > 0 && (
              <div
                className="h-1.5 bg-red-500 transition-all"
                style={{ width: `${(stats.failed / stats.total) * 100}%` }}
              />
            )}
            {stats.running > 0 && (
              <div
                className="h-1.5 bg-amber-400 animate-pulse transition-all"
                style={{ width: `${(stats.running / stats.total) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Expanded execution history */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-(--vestara-accent-border)">
          <div className="flex gap-4 mb-3">
            <div className="flex-1">
              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                Capabilities
              </div>
              <div className="flex flex-wrap gap-1">
                {(agent.capabilities || []).map((c: string) => (
                  <span
                    key={c}
                    className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-(--vestara-text-2) rounded-md border border-(--vestara-accent-border)/50"
                  >
                    {c}
                  </span>
                ))}
                {(!agent.capabilities || agent.capabilities.length === 0) && (
                  <span className="text-[9px] text-(--vestara-text-dim) italic">No capabilities defined</span>
                )}
              </div>
            </div>
            {team && (
              <div className="shrink-0">
                <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                  Team
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: color + '20', color }}>
                  {team.name}
                </span>
              </div>
            )}
          </div>

          <AgentExecutionHistory executions={agentExecutions} onOpenExecution={onOpenExecution} />

          <div className="mt-2 flex gap-2">
            <input
              value={runTask}
              onChange={(e) => setRunTask(e.target.value)}
              placeholder="Assign a task to this agent..."
              className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-600 outline-none focus:border-(--vestara-accent-border-active)"
              onKeyDown={(e) => e.key === 'Enter' && void runAgent()}
            />
            <button
              onClick={() => void runAgent()}
              disabled={running || !runTask.trim()}
              className="text-[10px] px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
            >
              {running ? 'Running...' : 'Run'}
            </button>
          </div>
          {runOutput && (
            <div className="mt-1.5 text-[10px] text-(--vestara-text-2) bg-zinc-800/50 border border-(--vestara-accent-border)/50 rounded-lg p-2">
              {runOutput}
            </div>
          )}

          <AgentHarnessSessions sessions={harnessSessions} onLoad={onLoad} />
        </div>
      )}
    </div>
  );
}
