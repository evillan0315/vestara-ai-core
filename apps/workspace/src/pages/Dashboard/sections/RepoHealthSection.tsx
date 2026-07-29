import type { Execution } from '../../../components/dashboard/constants';
import type { WorkspaceData } from '../../../lib/api';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface RepoHealthSectionProps {
  workspace: WorkspaceData;
  execStats: { total: number; completed: number; failed: number; running: number };
  dragSection: DragSectionProps;
}

export default function RepoHealthSection({ workspace, execStats, dragSection }: RepoHealthSectionProps) {
  const metrics = [
    {
      label: 'Code Quality',
      value: workspace.healthScore != null ? Math.round(workspace.healthScore * 2.5) : 0,
      max: 25,
    },
    {
      label: 'Test Coverage',
      value: execStats.total > 0 ? Math.round((execStats.completed / execStats.total) * 25) : 0,
      max: 25,
    },
    {
      label: 'Dependencies',
      value: Math.max(0, 25 - (workspace.dependencyCount > 50 ? 15 : workspace.dependencyCount > 20 ? 8 : 0)),
      max: 25,
    },
    {
      label: 'Documentation',
      value: workspace.healthScore != null ? Math.round(workspace.healthScore * 2) : 0,
      max: 20,
    },
    {
      label: 'Performance',
      value: workspace.fileCount > 500 ? 5 : workspace.fileCount > 200 ? 10 : 15,
      max: 20,
    },
  ];

  return (
    <DashboardSection title="Repository Health" icon="◈" dragSection={dragSection}>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <div className="flex items-center gap-4 mb-2">
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-zinc-700)" strokeWidth="6" />
              {workspace.healthScore != null && (
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
            <div
              className={`absolute inset-0 flex items-center justify-center text-base font-bold ${workspace.healthScore != null && workspace.healthScore >= 7 ? 'text-green-400' : workspace.healthScore != null && workspace.healthScore >= 4 ? 'text-amber-400' : 'text-zinc-500'}`}
            >
              {workspace.healthScore != null ? workspace.healthScore.toFixed(1) : '--'}
            </div>
          </div>
          <div className="text-[10px] text-zinc-400">
            <div>
              {workspace.packageManager ?? 'unknown'} · {workspace.isMonorepo ? 'monorepo' : 'single'}
            </div>
            <div className="text-[9px] text-zinc-600">
              {workspace.fileCount} files · {workspace.packageCount} packages · {workspace.dependencyCount} deps
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          {metrics.map((m) => {
            const pct = Math.min((m.value / m.max) * 100, 100);
            return (
              <div key={m.label} className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-500 w-[72px] shrink-0">{m.label}</span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: 'var(--vestara-accent)' }}
                  />
                </div>
                <span className="text-[9px] text-zinc-600 w-6 text-right">
                  {m.value}/{m.max}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardSection>
  );
}
