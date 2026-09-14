import { useState } from 'react';
import AgentExecutionHistory from './AgentExecutionHistory';
import AgentHarnessSessions from './AgentHarnessSessions';
import type { Agent, Execution, HarnessSessionEntry, Team } from './types';

type TabId = 'overview' | 'execution' | 'harness' | 'task';

interface AgentCardTabsProps {
  agent: Agent;
  team?: Team;
  executions: Execution[];
  harnessSessions: HarnessSessionEntry[];
  onOpenExecution: (execution: Execution) => void;
  onLoad: () => void;
  runTask: string;
  onRunTaskChange: (value: string) => void;
  running: boolean;
  runOutput: string | null;
  onRun: () => void;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'execution', label: 'Execution History' },
  { id: 'harness', label: 'Harness Sessions' },
  { id: 'task', label: 'Task' },
];

export function AgentCardTabs({
  agent,
  team,
  executions,
  harnessSessions,
  onOpenExecution,
  onLoad,
  runTask,
  onRunTaskChange,
  running,
  runOutput,
  onRun,
}: AgentCardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="border-t border-(--vestara-accent-border)">
      {/* Tab bar */}
      <div className="flex border-b border-(--vestara-accent-border)">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'text-(--vestara-text) border-b-2 border-amber-400'
                : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
            }`}
          >
            {tab.label}
            {tab.id === 'execution' && executions.length > 0 && (
              <span className="ml-1 text-[8px] bg-zinc-700 px-1 rounded">{executions.length}</span>
            )}
            {tab.id === 'harness' && harnessSessions.length > 0 && (
              <span className="ml-1 text-[8px] bg-zinc-700 px-1 rounded">{harnessSessions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div>
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
              <div>
                <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                  Team
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-400/10 text-amber-400">
                  {team.name}
                </span>
              </div>
            )}
            <div>
              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
                Details
              </div>
              <div className="space-y-1 text-[10px]">
                {agent.provider && (
                  <div className="flex justify-between">
                    <span className="text-(--vestara-text-muted)">Provider</span>
                    <span className="text-(--vestara-text-2)">{agent.provider}</span>
                  </div>
                )}
                {agent.model && (
                  <div className="flex justify-between">
                    <span className="text-(--vestara-text-muted)">Model</span>
                    <span className="text-(--vestara-text-2) font-mono">{agent.model}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-(--vestara-text-muted)">Role</span>
                  <span className="text-(--vestara-text-2)">{agent.role}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'execution' && (
          <AgentExecutionHistory executions={executions} onOpenExecution={onOpenExecution} />
        )}

        {activeTab === 'harness' && (
          <AgentHarnessSessions sessions={harnessSessions} onLoad={onLoad} />
        )}

        {activeTab === 'task' && (
          <div className="space-y-2">
            <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider">
              Assign Task
            </div>
            <div className="flex gap-2">
              <input
                value={runTask}
                onChange={(e) => onRunTaskChange(e.target.value)}
                placeholder="Enter task instruction..."
                className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-600 outline-none focus:border-(--vestara-accent-border-active)"
                onKeyDown={(e) => e.key === 'Enter' && onRun()}
              />
              <button
                onClick={onRun}
                disabled={running || !runTask.trim()}
                className="text-[10px] px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
              >
                {running ? 'Running...' : 'Run'}
              </button>
            </div>
            {runOutput && (
              <div className="text-[10px] text-(--vestara-text-2) bg-zinc-800/50 border border-(--vestara-accent-border)/50 rounded-lg p-2">
                {runOutput}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
