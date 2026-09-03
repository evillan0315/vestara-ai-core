import { useMemo, useState } from 'react';
import { useToasts } from '../../components/Toast';
import { AgentStatusBadge, getAgentColor } from '../../components/ui/agents';
import { harnessApi } from '../../lib/agent-harness';
import { AgentCardTabs } from './AgentCardTabs';
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
      <div className="p-2 sm:p-3 flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => isRegistered && onToggle()}>
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
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={`text-xs sm:text-sm font-semibold truncate ${isRegistered ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'}`}
            >
              {agent.name}
            </span>
            <span className="text-[7px] sm:text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) uppercase font-medium shrink-0">
              {agent.role}
            </span>
            <AgentStatusBadge status={agent.status} />
          </div>
          {agent.description && (
            <div
              className={`text-[9px] sm:text-[10px] truncate mt-0.5 ${isRegistered ? 'text-(--vestara-text-muted)' : 'text-(--vestara-text-dim)'}`}
            >
              {agent.description}
            </div>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5">
            {agent.provider && <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim) hidden sm:inline">{agent.provider}</span>}
            {agent.model && <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim) font-mono hidden sm:inline">{agent.model}</span>}
            {stats.total > 0 && (
              <span className="text-[8px] sm:text-[9px] text-(--vestara-text-dim)">
                {stats.completed}/{stats.total}
              </span>
            )}
            {stats.running > 0 && (
              <span className="text-[8px] sm:text-[9px] text-amber-400 animate-pulse font-semibold">{stats.running} active</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {isRegistered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-1 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-md hover:bg-amber-400/20 transition-colors cursor-pointer font-medium"
            >
              Run
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-accent-text) rounded-md hover:bg-(--vestara-accent-border)/20 transition-colors cursor-pointer font-medium"
          >
            {isRegistered ? 'Edit' : 'Register'}
          </button>
          {isRegistered && (
            <div className="relative group">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-dim) rounded-md hover:text-(--vestara-text-2) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
              >
                ⋯
              </button>
              <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block">
                <div className="bg-zinc-900 border border-(--vestara-accent-border) rounded-lg shadow-lg py-1 min-w-[100px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStatus();
                    }}
                    className="w-full text-left text-[10px] px-3 py-1.5 text-(--vestara-text-2) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
                  >
                    {agent.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="w-full text-left text-[10px] px-3 py-1.5 text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
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

      {/* Expanded content with tabs */}
      {isExpanded && (
        <AgentCardTabs
          agent={agent}
          team={team}
          executions={agentExecutions}
          harnessSessions={harnessSessions}
          onOpenExecution={onOpenExecution}
          onLoad={onLoad}
          runTask={runTask}
          onRunTaskChange={setRunTask}
          running={running}
          runOutput={runOutput}
          onRun={runAgent}
        />
      )}
    </div>
  );
}
