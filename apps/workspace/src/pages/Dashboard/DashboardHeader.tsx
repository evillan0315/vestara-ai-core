import { RouteHero } from '../../components/layout/PageHero/RouteHero';
import { StatCard } from '../../components/dashboard';
import type { MilestoneResponse } from '../../components/dashboard/constants';
import type { AgentData, WorkspaceData } from '../../lib/api';

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
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const healthy = workspace?.healthScore == null || workspace.healthScore >= 7;
  return (
    <>
      <RouteHero
        routeId="dashboard"
        statusTone={connected ? 'success' : 'error'}
        title={workspace?.name ?? 'Dashboard'}
        subtitle={`${workspace?.fileCount ?? 0} files · ${workspace?.packageCount ?? 0} packages · ${events.length} events · ${agents.length} agents`}
        actions={[
          { label: '▶ Start Workflow', primary: true, onClick: onStartWorkflow },
          { label: '🎛️ Ops Center', to: '/ops' },
          { label: '▤ Sessions', to: '/sessions' },
          { label: '☰ Agents', to: '/agents' },
          { label: '◇ Artifacts', to: '/artifacts' },
        ]}
        meta={
          <span className="mpg-tag-pill" style={{ color: 'var(--vestara-text-secondary)' }}>
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)',
                boxShadow: `0 0 6px ${healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)'}`,
              }}
            />
            {workspace?.healthScore != null ? `Health ${workspace.healthScore.toFixed(1)}/10` : connected ? 'Online' : 'Offline'}
          </span>
        }
        stats={[
          { label: 'executions', value: execStats.total },
          { label: 'running', value: execStats.running },
          { label: 'agents', value: `${activeAgents}/${agents.length}` },
          { label: 'milestones', value: `${milestones?.progress.completed ?? 0}/${milestones?.progress.total ?? 43}` },
        ]}
      />

      <div className="mpg-card mb-4 p-4">
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
                  stroke={
                    workspace.healthScore >= 7
                      ? 'var(--vestara-green)'
                      : workspace.healthScore >= 4
                        ? '#f59e0b'
                        : 'var(--vestara-red)'
                  }
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(workspace.healthScore / 10) * 188.5} 188.5`}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-(--vestara-text)">
              {workspace?.healthScore != null ? workspace.healthScore.toFixed(1) : '--'}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-(--vestara-text)">{workspace?.name ?? 'Dashboard'}</h1>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full ${connected ? 'bg-(--vestara-green)/20 text-(--vestara-green)' : 'bg-(--vestara-red)/20 text-(--vestara-red)'}`}
              >
                {connected ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-[10px] text-(--vestara-text-muted) mt-0.5">
              {workspace?.fileCount ?? 0} files · {workspace?.packageCount ?? 0} packages · {events.length} events ·{' '}
              {agents.length} agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-(--vestara-text-muted)">{new Date(lastRefresh).toLocaleTimeString()}</span>
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all cursor-pointer ${autoRefresh ? 'bg-(--vestara-green)/15 text-(--vestara-green)' : 'text-(--vestara-text-dim) hover:text-(--vestara-text-2)'}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-(--vestara-green) animate-pulse' : `'bg-(--vestara-zinc)`}`}
            />
            {autoRefresh ? 'LIVE' : 'REFRESH'}
          </button>
          <button onClick={onRefresh} className="mpg-pill cursor-pointer text-sm" title="Refresh">
            ↻
          </button>
          <div className="relative">
            <button
              onClick={onToggleSectionPicker}
              className="mpg-pill flex cursor-pointer items-center gap-1 text-[9px] transition-colors"
            >
              <span>⊞</span> Sections
            </button>
            {showSectionPicker && (
              <div className="mpg-card absolute right-0 top-7 z-50 max-h-72 w-48 overflow-y-auto py-1">
                {sectionOrder
                  .filter((id) => id !== 'system')
                  .map((id) => (
                    <button
                      key={id}
                      onClick={() => onToggleVisibility(id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-(--vestara-accent-bg) transition-colors flex items-center gap-2 text-(--vestara-text-2)"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${sectionVisibility[id] === false ? 'bg-zinc-700' : 'bg-(--vestara-accent)'}`}
                      />
                      <span className={sectionVisibility[id] === false ? 'text-(--vestara-text-dim) line-through' : ''}>
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

      </div>
    </>
  );
}
