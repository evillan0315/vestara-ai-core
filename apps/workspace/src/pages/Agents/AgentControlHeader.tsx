import type { ExecutionSummary } from './types';

interface AgentControlHeaderProps {
  agentsCount: number;
  activeCount: number;
  totalSlots: number;
  teamsCount: number;
  executionsCount: number;
  execSummary: ExecutionSummary;
  onAddAgent: () => void;
  onAddTeam: () => void;
  onToggleWorkflow: () => void;
  onRefresh: () => void;
  onSyncAgents?: () => void;
  syncing?: boolean;
}

export default function AgentControlHeader({
  agentsCount,
  activeCount,
  totalSlots,
  teamsCount,
  executionsCount,
  execSummary,
  onAddAgent,
  onAddTeam,
  onToggleWorkflow,
  onRefresh,
  onSyncAgents,
  syncing,
}: AgentControlHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Agent Control Center</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            {activeCount} active · {agentsCount}/{totalSlots} registered · {teamsCount} teams · {executionsCount}{' '}
            executions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddAgent}
            className="text-xs px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 transition-colors cursor-pointer font-medium"
          >
            + Add Agent
          </button>
          <button
            onClick={onAddTeam}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
          >
            + Team
          </button>
          <button
            onClick={onToggleWorkflow}
            className="text-xs px-3 py-1.5 bg-purple-400/10 border border-purple-400/30 text-purple-400 rounded-lg hover:bg-purple-400/20 transition-colors cursor-pointer font-medium"
            title="Run a multi-agent workflow (planner → developer → verifier → reviewer)"
          >
            ⚡ Run Workflow
          </button>
          {onSyncAgents && (
            <button
              onClick={onSyncAgents}
              disabled={syncing}
              className="text-xs px-3 py-1.5 bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 rounded-lg hover:bg-emerald-400/20 transition-colors cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sync canonical agents to .opencode/agents/*.md"
            >
              {syncing ? '⟳ Syncing…' : '↻ Sync Agents'}
            </button>
          )}
          <button
            onClick={onRefresh}
            className="text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Registered</div>
          <div className="text-lg font-bold text-(--vestara-text) mt-1">
            {agentsCount}/{totalSlots}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Active</div>
          <div className="text-lg font-bold text-green-400 mt-1">{activeCount}</div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Executions</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-blue-400">{executionsCount}</span>
            {execSummary.running > 0 && (
              <span className="text-[10px] text-amber-400">{execSummary.running} active</span>
            )}
          </div>
        </div>
        <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider">Success Rate</div>
          <div
            className={`text-lg font-bold mt-1 ${execSummary.successRate >= 80 ? 'text-green-400' : execSummary.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}
          >
            {execSummary.successRate}%
          </div>
        </div>
      </div>
    </>
  );
}
