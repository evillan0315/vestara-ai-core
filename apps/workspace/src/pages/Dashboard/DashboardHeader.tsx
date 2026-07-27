import { StatCard } from '../../components/dashboard';
import type { WorkspaceData, AgentData } from '../../lib/api';
import type { MilestoneResponse } from '../../components/dashboard/constants';

interface DashboardHeaderProps {
  workspace: WorkspaceData | null;
  agents: AgentData[];
  connected: boolean;
  events: { readonly length: number };
  lastRefresh: string;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
  showSectionPicker: boolean;
  onToggleSectionPicker: () => void;
  sectionOrder: string[];
  sectionVisibility: Record<string, boolean>;
  onToggleVisibility: (id: string) => void;
  execStats: { total: number; running: number; completed: number };
  activityStats: { lastHour: number };
  milestones: MilestoneResponse | null;
  execSessions: Record<string, unknown>[];
  onStartWorkflow: () => void;
}

export default function DashboardHeader({
  workspace,
  agents,
  connected,
  events,
  lastRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  showSectionPicker,
  onToggleSectionPicker,
  sectionOrder,
  sectionVisibility,
  onToggleVisibility,
  execStats,
  activityStats,
  milestones,
  execSessions,
  onStartWorkflow,
}: DashboardHeaderProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-zinc-700)" strokeWidth="6" />
              {workspace?.healthScore != null && (
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke={workspace.healthScore >= 7 ? '#22c55e' : workspace.healthScore >= 4 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(workspace.healthScore / 10) * 188.5} 188.5`}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-300">
              {workspace?.healthScore != null ? workspace.healthScore.toFixed(1) : '--'}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-100">{workspace?.name ?? 'Dashboard'}</h1>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${connected ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}
              >
                {connected ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {workspace?.fileCount ?? 0} files · {workspace?.packageCount ?? 0} packages · {events.length} events ·{' '}
              {agents.length} agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600">{new Date(lastRefresh).toLocaleTimeString()}</span>
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all cursor-pointer ${autoRefresh ? 'bg-green-400/15 text-green-400' : 'text-zinc-700 hover:text-zinc-500'}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-zinc-700'}`}
            />
            {autoRefresh ? 'LIVE' : 'REFRESH'}
          </button>
          <button onClick={onRefresh} className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm">
            ↻
          </button>
          <div className="relative">
            <button
              onClick={onToggleSectionPicker}
              className="text-[9px] px-2 py-1 border border-zinc-800 rounded text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>⊞</span> Sections
            </button>
            {showSectionPicker && (
              <div className="absolute right-0 top-7 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                {sectionOrder
                  .filter((id) => id !== 'system')
                  .map((id) => (
                    <button
                      key={id}
                      onClick={() => onToggleVisibility(id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors flex items-center gap-2 text-zinc-400"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${sectionVisibility[id] === false ? 'bg-zinc-700' : 'bg-accent'}`}
                      />
                      <span className={sectionVisibility[id] === false ? 'text-zinc-700 line-through' : ''}>
                        {id.replace(/-/g, ' ')}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
        <StatCard
          label="Executions"
          value={execStats.total}
          sub={`${execStats.running} running`}
          accent="var(--vestara-accent)"
        />
        <StatCard
          label="Health"
          value={workspace?.healthScore?.toFixed(1) ?? '--'}
          accent={workspace?.healthScore != null && workspace.healthScore >= 7 ? '#10b981' : '#f59e0b'}
        />
        <StatCard label="Agents" value={agents.length} accent="var(--vestara-accent)" />
        <StatCard
          label="Events"
          value={events.length}
          sub={`${activityStats.lastHour}/hr`}
          accent="var(--vestara-accent)"
        />
        <StatCard
          label="Milestones"
          value={`${milestones?.progress.completed ?? 0}/${milestones?.progress.total ?? 43}`}
          accent="var(--vestara-accent)"
        />
        <StatCard label="Sessions" value={execSessions.length} accent="var(--vestara-accent)" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <a
          href="/ops"
          className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-all cursor-pointer"
        >
          🎛️ Ops Center
        </a>
        <a
          href="/sessions"
          className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-all cursor-pointer"
        >
          ▤ Sessions
        </a>
        <a
          href="/agents"
          className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-all cursor-pointer"
        >
          ☰ Agents
        </a>
        <a
          href="/artifacts"
          className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-all cursor-pointer"
        >
          ◇ Artifacts
        </a>
        <button
          onClick={onStartWorkflow}
          className="text-[10px] px-3 py-1.5 accent-btn rounded-lg cursor-pointer flex items-center gap-1"
        >
          <span>▶</span> Start Workflow
        </button>
      </div>
    </div>
  );
}
