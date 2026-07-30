import { useState } from 'react';
import type { Agent } from '../../pages/OpsCenter';
import DashboardListCard from '../dashboard/DashboardListCard';
import DashboardListItem from '../dashboard/DashboardListItem';
import Pagination from '../Pagination';

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
  const icons: Record<string, string> = { Input: '🎤', Analyze: '🔍', Plan: '📋', Implement: '⚡', Verify: '✓', Release: '📦' };
  return <span className="text-xs">{icons[stage] || '○'}</span>;
}

export default function OpsLeftSidebar({
  health, connected, pipelineStages, bgRunning, bgObservations, onRunBackground, activeSessions, agents,
}: OpsLeftSidebarProps) {
  const [sessionsPage, setSessionsPage] = useState(1);
  const SESSIONS_PAGE_SIZE = 4;
  return (
    <aside className="flex flex-col gap-6">
      <DashboardListCard title="Runtime" subtitle="Engine Information" icon={<span className="text-xs">⚙️</span>}>
        {health ? (
          <>
            <DashboardListItem label="Uptime" value={health.uptime ? `${Math.floor(health.uptime / 60)}m` : 'N/A'} />
            <DashboardListItem label="Memory" value={health.memoryMB ? `${health.memoryMB} MB` : health.memory ? `${Math.round((health.memory.heapUsed || health.memory.heapTotal || 0))} MB` : 'N/A'} />
            <DashboardListItem label="Version" value={health.version || health.buildVersion || '0.4.0'} />
            <DashboardListItem label="Sessions" value={health.sessionCount ?? health.activeSessions ?? (activeSessions?.length ?? 0)} />
            <DashboardListItem label="Workspace" value={health.repoPath ? health.repoPath.split('/').pop() || health.repoPath : 'N/A'} />
            <div className="flex items-center gap-2 text-xs text-(--vestara-text-2)">
              <span className={`w-2 h-2 rounded-full inline-block ${connected ? 'bg-(--vestara-green)' : 'bg-(--vestara-text-dim)'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
          </>
        ) : (
          <div className="text-xs text-(--vestara-text-muted) py-2">Health data unavailable</div>
        )}
      </DashboardListCard>

      {/* Background Services - moved to top */}
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
        <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Background Services</h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-(--vestara-text-2)">Observations</span>
          <span className="text-xs font-medium text-(--vestara-text)">{bgObservations}</span>
        </div>
        <button onClick={onRunBackground} disabled={bgRunning}
          className="w-full text-xs px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) transition-colors disabled:opacity-50 cursor-pointer">
          {bgRunning ? 'Running...' : 'Run Background Analysis'}
        </button>
      </div>

      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
        <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Pipeline</h3>
        <div className="relative">
          {pipelineStages.map((stage: any, i: number) => (
            <div key={stage.stage} className="relative flex items-start gap-3 pb-4 last:pb-0">
              {i < pipelineStages.length - 1 && <div className="absolute left-[11px] top-5 bottom-0 w-px bg-(--vestara-accent-border)" />}
              <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${stage.status ? 'bg-(--vestara-accent) text-white' : 'bg-(--vestara-accent-bg) text-(--vestara-text-2)'}`}>
                <PipelineIcon stage={stage.stage} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className={`text-[11px] font-medium ${stage.status ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'}`}>{stage.stage}</div>
                <div className="text-[9px] text-(--vestara-text-dim)">{stage.agents} agent{stage.agents !== 1 ? 's' : ''}</div>
              </div>
              {stage.status && <span className="shrink-0 w-2 h-2 rounded-full bg-(--vestara-green) animate-pulse mt-1.5" />}
            </div>
          ))}
        </div>
      </div>

      {health?.categories && (
        <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
          <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">System Health</h3>
          <div className="space-y-2">
            {Object.entries(health.categories).map(([key, val]: [string, any]) => {
              const score = typeof val === 'number' ? val : val?.score ?? 0;
              const pct = Math.min(Math.max(score * 10, 0), 100);
              const color = pct >= 70 ? 'bg-(--vestara-green)' : pct >= 40 ? 'bg-amber-400' : 'bg-(--vestara-red)';
              return (
                <div key={key}>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-(--vestara-text-2) capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-(--vestara-text-2) font-medium">{score.toFixed(1)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-(--vestara-accent-bg) rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSessions.length > 0 && (
        <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
          <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">
            Active Sessions ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.slice((sessionsPage - 1) * SESSIONS_PAGE_SIZE, sessionsPage * SESSIONS_PAGE_SIZE).map((s: any) => (
              <div key={s.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-(--vestara-accent) animate-pulse shrink-0" />
                  <span className="text-(--vestara-text) truncate">{s.goal?.slice(0, 50) || 'Untitled'}</span>
                </div>
                {s.metrics && <div className="text-[9px] text-(--vestara-text-dim) ml-3.5">{s.metrics.completedSteps ?? 0}/{s.metrics.totalSteps ?? 0} steps</div>}
              </div>
            ))}
          </div>
          {activeSessions.length > SESSIONS_PAGE_SIZE && (
            <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
              <Pagination current={sessionsPage} total={activeSessions.length} pageSize={SESSIONS_PAGE_SIZE} onChange={setSessionsPage} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
