import DashboardListCard from '../dashboard/DashboardListCard';
import DashboardListItem from '../dashboard/DashboardListItem';
import MemoryRounded from '@mui/icons-material/MemoryRounded';
import type { Agent } from '../../pages/OpsCenter';

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

export default function OpsLeftSidebar({ health, connected, pipelineStages, bgRunning, bgObservations, onRunBackground, activeSessions, agents }: OpsLeftSidebarProps) {
  return (
    <aside className="flex flex-col gap-6">
      <DashboardListCard title="Runtime" subtitle="Engine Information" icon={<MemoryRounded fontSize="small" />}>
        {health && (
          <>
            <DashboardListItem label="Uptime" value="28 min" />
            <DashboardListItem label="Memory" value="421 MB" />
            <DashboardListItem label="Version" value="7.3.0" />
            <DashboardListItem label="Sessions" value="14" />
            <DashboardListItem label="Workspace" value="/workspace/vestara" />
            <div className="flex items-center gap-2 text-xs text-[var(--vestara-text-2)]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: connected ? 'var(--vestara-green)' : 'var(--color-zinc-600)' }} />
              Provider: {typeof (globalThis as any).process?.env?.PROVIDER_NAME !== 'undefined' ? (globalThis as any).process.env.PROVIDER_NAME : 'OpenCode'}
            </div>
          </>
        )}
      </DashboardListCard>
      <PipelineStatus stages={pipelineStages} />
      {health?.categories && <SystemHealthGauge health={health} />}
      <BackgroundServices
        bgRunning={bgRunning}
        bgObservations={bgObservations}
        onRunBackground={onRunBackground}
      />
      {activeSessions.length > 0 && <ActiveSessionsPanel activeSessions={activeSessions} />}
    </aside>
  );
}

function PipelineStatus({ stages }: { stages: any[] }) {
  return (
    <div className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg p-4">
      <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">Pipeline</h3>
      <div className="space-y-1">
        {stages.map((stage: any) => (
          <div key={stage.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.status === 'running' ? 'var(--vestara-green)' : stage.status === 'queued' ? '#f59e0b' : 'var(--color-zinc-700)' }} />
            <span className="text-[var(--vestara-text)]">{stage.name}</span>
            <span className="ml-auto text-[var(--vestara-text-muted)]">{stage.agents}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemHealthGauge({ health }: { health: any }) {
  const cats = Object.entries(health.categories);
  if (cats.length === 0) return null;
  return (
    <div className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg p-4">
      <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">Health</h3>
      <div className="space-y-2">
        {cats.map(([name, status]) => {
          const s = status as string;
          return (
          <div key={name} className="flex items-center justify-between text-xs">
            <span className="text-[var(--vestara-text)] capitalize">{name}</span>
            <span className="capitalize" style={{ color: s === 'healthy' ? 'var(--vestara-green)' : s === 'degraded' ? '#f59e0b' : 'var(--vestara-red)' }}>{s}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function BackgroundServices({ bgRunning, bgObservations, onRunBackground }: { bgRunning: boolean; bgObservations: number; onRunBackground: () => void }) {
  return (
    <div className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider">Background</h3>
        <button onClick={onRunBackground} className="text-[10px] px-2 py-0.5 rounded bg-[var(--vestara-accent)]/10 text-[var(--vestara-accent-text)] hover:bg-[var(--vestara-accent)]/20 transition-colors cursor-pointer">
          Run
        </button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--vestara-text)]">Observations</span>
          <span className="text-[var(--vestara-text-muted)]">{bgObservations}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--vestara-text)]">Indexing</span>
          <span className="text-[var(--vestara-green)] bg-[var(--vestara-green)]/10 px-1.5 py-0.5 rounded text-[10px]">running</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--vestara-text)]">Status Check</span>
          <span className="text-[var(--vestara-green)] bg-[var(--vestara-green)]/10 px-1.5 py-0.5 rounded text-[10px]">healthy</span>
        </div>
      </div>
    </div>
  );
}

function ActiveSessionsPanel({ activeSessions }: { activeSessions: any[] }) {
  return (
    <div className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg p-4">
      <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">Active Sessions</h3>
      <div className="space-y-2">
        {activeSessions.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--vestara-green)] animate-pulse" />
            <span className="text-[var(--vestara-text)] truncate">{s.goal}</span>
            <span className="ml-auto text-[var(--vestara-text-muted)]">{s.progress}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}