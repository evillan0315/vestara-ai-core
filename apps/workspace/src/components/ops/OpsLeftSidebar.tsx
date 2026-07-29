import type { Agent } from '../../pages/OpsCenter';
import DashboardListCard from '../dashboard/DashboardListCard';
import DashboardListItem from '../dashboard/DashboardListItem';

interface OpsLeftSidebarProps {
  health: any;
  connected: boolean;
  pipelineStages: any[];
  bgRunning: boolean;
  bgObservations: number;
  onRunBackground: () => void;
  activeSessions: any[];
  agents: Agent[];
}

function PipelineIcon({ stage }: { stage: string }) {
  const icons: Record<string, string> = {
    Input: '🎤',
    Analyze: '🔍',
    Plan: '📋',
    Implement: '⚡',
    Verify: '✓',
    Release: '📦',
  };
  return <span className="text-xs">{icons[stage] || '○'}</span>;
}

export default function OpsLeftSidebar({
  health,
  connected,
  pipelineStages,
  bgRunning,
  bgObservations,
  onRunBackground,
  activeSessions,
  agents,
}: OpsLeftSidebarProps) {
  return (
    <aside className="flex flex-col gap-6">
      <DashboardListCard title="Runtime" subtitle="Engine Information" icon={<span className="text-xs">⚙️</span>}>
        {health ? (
          <>
            <DashboardListItem label="Uptime" value={health.uptime ? `${Math.floor(health.uptime / 60)}m` : 'N/A'} />
            <DashboardListItem
              label="Memory"
              value={health.memoryMB
                ? `${health.memoryMB} MB`
                : health.memory
                  ? `${Math.round((health.memory.heapUsed || health.memory.heapTotal || 0))} MB`
                  : 'N/A'}
            />
            <DashboardListItem label="Version" value={health.version || health.buildVersion || '0.4.0'} />
            <DashboardListItem label="Sessions" value={health.sessionCount ?? health.activeSessions ?? (activeSessions?.length ?? 0)} />
            <DashboardListItem label="Workspace" value={health.repoPath ? health.repoPath.split('/').pop() || health.repoPath : 'N/A'} />
            <div className="flex items-center gap-2 text-xs text-[var(--vestara-text-2)]">
              <span className={`w-2 h-2 rounded-full inline-block ${connected ? 'bg-[var(--vestara-green)]' : 'bg-zinc-600'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </>
        ) : (
          <div className="text-xs text-[var(--vestara-text-muted)] py-2">Health data unavailable</div>
        )}
      </DashboardListCard>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">Pipeline</h3>
        <div className="relative">
          {pipelineStages.map((stage: any, i: number) => (
            <div key={stage.stage} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {i < pipelineStages.length - 1 && (
                <div className="absolute left-[11px] top-5 bottom-0 w-px bg-zinc-700" />
              )}
              <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                stage.status ? 'bg-[var(--vestara-accent)] text-white' : 'bg-zinc-800 text-zinc-600'
              }`}>
                <PipelineIcon stage={stage.stage} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className={`text-[11px] font-medium ${stage.status ? 'text-[var(--vestara-text)]' : 'text-zinc-600'}`}>
                  {stage.stage}
                </div>
                <div className="text-[9px] text-zinc-600">{stage.agents} agent{stage.agents !== 1 ? 's' : ''}</div>
              </div>
              {stage.status && <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--vestara-green)] animate-pulse mt-1.5" />}
            </div>
          ))}
        </div>
      </div>

      {health?.categories && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
            System Health
          </h3>
          <div className="space-y-2">
            {Object.entries(health.categories).map(([key, val]: [string, any]) => {
              const score = typeof val === 'number' ? val : val?.score ?? 0;
              const pct = Math.min(Math.max(score * 10, 0), 100);
              const color = pct >= 70 ? 'bg-[var(--vestara-green)]' : pct >= 40 ? 'bg-amber-400' : 'bg-[var(--vestara-red)]';
              return (
                <div key={key}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-zinc-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-zinc-400 font-medium">{score.toFixed(1)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
          Background Services
        </h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-zinc-500">Observations</span>
          <span className="text-xs font-medium text-[var(--vestara-text)]">{bgObservations}</span>
        </div>
        <button
          onClick={onRunBackground}
          disabled={bgRunning}
          className="w-full text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-[var(--vestara-text-muted)] rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {bgRunning ? 'Running...' : 'Run Background Analysis'}
        </button>
      </div>

      {activeSessions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
            Active Sessions ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.slice(0, 5).map((s: any) => (
              <div key={s.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--vestara-accent)] animate-pulse shrink-0" />
                  <span className="text-[var(--vestara-text)] truncate">{s.goal?.slice(0, 50) || 'Untitled'}</span>
                </div>
                {s.metrics && (
                  <div className="text-[9px] text-zinc-600 ml-3.5">
                    {s.metrics.completedSteps ?? 0}/{s.metrics.totalSteps ?? 0} steps
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
