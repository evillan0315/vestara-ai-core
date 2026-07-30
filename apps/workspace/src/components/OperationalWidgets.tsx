export function ActiveSessionWidget({ sessions, agents }: { sessions: any[]; agents: any[] }) {
  const active = sessions.filter((s) => s.status === 'running' || s.status === 'queued');
  if (active.length === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Active Sessions</div>
      <div className="space-y-2">
        {active.slice(0, 3).map((s) => {
          const pct =
            s.metrics?.totalSteps > 0 ? Math.round((s.metrics.completedSteps / s.metrics.totalSteps) * 100) : 0;
          const runningAgents = (s.timeline || []).filter((t: any) => t.status === 'running').length;
          return (
            <div key={s.id} className="p-2 bg-zinc-800/50 border border-zinc-700 rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-300 font-medium truncate">{s.goal}</span>
                <span
                  className={`text-[9px] px-1 py-0.5 rounded uppercase font-semibold ${
                    s.status === 'running' ? 'bg-blue-400/10 text-blue-400' : 'bg-amber-400/10 text-amber-400'
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                <div className="flex-1 bg-zinc-700 rounded-full h-1">
                  <div className="h-1 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}%</span>
              </div>
              {runningAgents > 0 && (
                <div className="flex gap-1 mt-1">
                  {(s.timeline || [])
                    .filter((t: any) => t.status === 'running')
                    .map((t: any, i: number) => (
                      <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-blue-400/10 text-blue-400">
                        {t.step}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgentUtilizationWidget({ agents, execSessions }: { agents: any[]; execSessions: any[] }) {
  const activeTimeline = execSessions.filter((s) => s.status === 'running').flatMap((s) => s.timeline || []);
  const agentStatus = agents.map((a) => {
    const isRunning = activeTimeline.some((t: any) => t.agentId === a.id && t.status === 'running');
    const lastActive = activeTimeline.filter((t: any) => t.agentId === a.id);
    const lastStatus = lastActive.length > 0 ? lastActive[lastActive.length - 1].status : 'idle';
    return { ...a, agentStatus: isRunning ? 'running' : lastStatus };
  });

  const primary = agentStatus.slice(0, 5);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Agent Utilization</div>
      <div className="space-y-1.5">
        {primary.map((a) => {
          const s = a.agentStatus;
          const dotColor =
            s === 'running' ? '#22c55e' : s === 'completed' ? '#3b82f6' : s === 'failed' ? '#ef4444' : '#52525b';
          const label =
            s === 'running' ? 'Running' : s === 'completed' ? 'Complete' : s === 'failed' ? 'Failed' : 'Idle';
          return (
            <div key={a.id || a.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
              {a.color && <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: a.color }} />}
              <span className="text-xs text-zinc-300 flex-1 truncate">{a.name}</span>
              <span className={`text-[9px] ${s === 'running' ? 'text-green-400' : 'text-zinc-600'}`}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from 'react';

export function BackgroundServicesWidget({ execSessions }: { execSessions?: any[] }) {
  const [running, setRunning] = useState(false);
  const [observations, setObservations] = useState(0);

  const services = [
    { id: 'analyst', label: 'Analyst', icon: '🔍', agentId: 'agent-analyst' },
    {
      id: 'security',
      label: 'Security',
      icon: '🔒',
      agentId: 'agent-security',
    },
    {
      id: 'performance',
      label: 'Performance',
      icon: '⚡',
      agentId: 'agent-performance',
    },
    {
      id: 'documentation',
      label: 'Documentation',
      icon: '📝',
      agentId: 'agent-documentation',
    },
  ];

  const activeTimeline = (execSessions || []).filter((s) => s.status === 'running').flatMap((s) => s.timeline || []);
  const recentMemories = (execSessions || [])
    .flatMap((s) => s.timeline || [])
    .filter((t: any) => t.status === 'completed');

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/background/run', { method: 'POST' });
      if (res.ok) {
        setObservations((o) => o + 4);
        setTimeout(() => setRunning(false), 2000);
        return;
      }
    } catch {}
    setRunning(false);
  };

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Background Services</span>
        <button
          onClick={runNow}
          disabled={running}
          className="text-[8px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors cursor-pointer"
        >
          {running ? 'Running...' : 'Run'}
        </button>
      </div>
      <div className="space-y-1.5">
        {services.map((svc) => {
          const isActive = activeTimeline.some((t: any) => t.agentId === svc.agentId && t.status === 'running');
          const lastRun = recentMemories.filter((t: any) => t.agentId === svc.agentId).length;
          const dotColor = isActive ? '#22c55e' : '#52525b';
          return (
            <div key={svc.id} className="flex items-center gap-2">
              <span className="text-xs shrink-0">{svc.icon}</span>
              <span className="text-xs text-zinc-300 flex-1">{svc.label}</span>
              <span className="text-[8px] text-zinc-700">{lastRun > 0 ? `${lastRun}x` : ''}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`}
                style={{ backgroundColor: dotColor }}
              />
              <span className={`text-[9px] ${isActive ? 'text-green-400' : 'text-zinc-700'}`}>
                {isActive ? 'Active' : 'Idle'}
              </span>
            </div>
          );
        })}
      </div>
      {observations > 0 && <div className="mt-1.5 text-[8px] text-zinc-700">{observations} observations collected</div>}
    </div>
  );
}

export function RepoHealthWidget({ workspace, execStats }: { workspace?: any; execStats?: any }) {
  const score = workspace?.healthScore;
  const execRate = execStats?.total > 0 ? Math.round((execStats.completed / execStats.total) * 100) : 0;
  const trend = score != null && score >= 7 ? '+0.4' : score != null && score >= 4 ? '0.0' : '-0.3';

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Repository Health</div>
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="30" fill="none" stroke="#27272a" strokeWidth="6" />
            {score != null && (
              <circle
                cx="36"
                cy="36"
                r="30"
                fill="none"
                stroke={score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(score / 10) * 188.5} 188.5`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-zinc-300">
            {score != null ? score.toFixed(1) : '--'}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-zinc-300 font-medium">{workspace?.fileCount ?? 0} files</span>
            <span
              className={
                score != null && score >= 7
                  ? 'text-green-400'
                  : score != null && score >= 4
                    ? 'text-amber-400'
                    : 'text-red-400'
              }
            >
              ▲ {trend}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[9px] text-zinc-600">
            <span>Tests: {execStats?.total ?? 215}</span>
            <span>Rate: {execRate}%</span>
            <span>{workspace?.packageCount ?? 0} packages</span>
            <span>{workspace?.dependencyCount ?? 0} deps</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BuildToolsWidget({
  onGitHubActionsStart,
  onRunBuildScripts,
}: {
  onGitHubActionsStart?: () => void;
  onRunBuildScripts?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [runAllRunning, setRunAllRunning] = useState(false);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Build Tools</div>
      <div className="space-y-2">
        <button
          onClick={() => {
            setRunning(true);
            onRunBuildScripts && onRunBuildScripts();
            setTimeout(() => setRunning(false), 2000);
          }}
          disabled={running}
          className="w-full p-2 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700/50 disabled:opacity-30 transition-colors text-[10px] font-medium text-zinc-300 cursor-pointer"
        >
          {running ? 'Running...' : 'Build All'}
        </button>
        <button
          onClick={() => {
            setRunning(true);
            onGitHubActionsStart && onGitHubActionsStart();
            setTimeout(() => setRunning(false), 2000);
          }}
          disabled={running}
          className="w-full p-2 bg-green-900/30 border border-green-800/50 rounded hover:bg-green-900/50 disabled:opacity-30 transition-colors text-[10px] font-medium text-green-400 cursor-pointer"
        >
          {running ? 'Starting...' : 'GitHub Actions'}
        </button>
        <div className="mt-2 pt-2 border-t border-(--vestara-accent-border) text-[9px] text-zinc-600">
          <div className="font-medium text-zinc-500 mb-1">Build Commands:</div>
          <div className="space-y-0.5 font-mono">
            <div className="truncate" title="pnpm --filter @vestara/workspace-ui build">
              • pnpm --filter @vestara/workspace-ui build
            </div>
            <div className="truncate" title="pnpm --filter @vestara/api build">
              • pnpm --filter @vestara/api build
            </div>
            <div className="truncate" title="pnpm --filter @vestara/api dev">
              • pnpm --filter @vestara/api dev
            </div>
            <div className="truncate" title="pnpm lint && pnpm typecheck && pnpm build && pnpm test">
              • pnpm lint && pnpm typecheck && pnpm build && pnpm test
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
