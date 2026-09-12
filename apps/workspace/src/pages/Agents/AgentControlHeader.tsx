import { PageHero } from '../../components/layout/PageHero/PageHero.js';
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
      <PageHero
        eyebrow="Workforce"
        statusColor={
          activeCount > 0 ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)'
        }
        title="Agent Control Center"
        subtitle={`${activeCount} active · ${agentsCount}/${totalSlots} registered · ${teamsCount} teams · ${executionsCount} executions`}
        actions={[
          { label: '+ Add Agent', primary: true, onClick: onAddAgent },
          { label: '+ Team', onClick: onAddTeam },
          {
            label: '⚡ Run Workflow',
            onClick: onToggleWorkflow,
            title: 'Run a multi-agent workflow (planner → developer → verifier → reviewer)',
          },
          ...(onSyncAgents
            ? [
                {
                  label: syncing ? '⟳ Syncing…' : '↻ Sync Agents',
                  onClick: onSyncAgents,
                  disabled: syncing,
                  title: 'Sync canonical agents to .opencode/agents/*.md',
                },
              ]
            : []),
          { label: '↻', onClick: onRefresh, title: 'Refresh' },
        ]}
        stats={[
          { label: 'registered', value: `${agentsCount}/${totalSlots}` },
          { label: 'active', value: activeCount },
          { label: 'executions', value: executionsCount },
          { label: 'success', value: `${execSummary.successRate}%` },
        ]}
        label="Agent control highlights"
      />

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
