import { type ReactNode, useMemo, useState } from 'react';
import { Alert } from '../components/Alert';
import { VestaraModal } from '../components/ui/VestaraModal';

export interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  compact?: boolean;
}

export function StatCard({ label, value, sub, accent = '#52525b', compact }: StatCardProps) {
  return (
    <div
      className={`text-center bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[2px] ${compact ? 'p-1.5' : 'p-2'}`}
      style={{ borderLeftColor: accent }}
    >
      <div
        className={`font-bold ${compact ? 'text-xs' : 'text-lg'}`}
        style={{ color: Number(value) > 0 ? accent : '#52525b' }}
      >
        {value}
      </div>
      <div className="text-[9px] text-zinc-600">{label}</div>
      {sub && <div className="text-[8px] text-zinc-700 mt-0.5">{sub}</div>}
    </div>
  );
}

export interface StatusBadgeProps {
  status: string;
  type?: 'agent' | 'user' | 'system';
}

export function StatusBadge({ status, type = 'agent' }: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  const styles = {
    agent: {
      active: 'bg-green-400/10 text-green-400',
      inactive: 'bg-zinc-800 text-zinc-600',
      queued: 'bg-amber-400/10 text-amber-400',
      completed: 'bg-blue-400/10 text-blue-400',
      failed: 'bg-red-400/10 text-red-400',
      running: 'bg-green-400/10 text-green-400 animate-pulse',
    },
    user: {
      active: 'bg-accent/10 text-accent',
      inactive: 'bg-zinc-800 text-zinc-600',
    },
    system: {
      active: 'bg-blue-400/10 text-blue-400',
      warning: 'bg-amber-400/10 text-amber-400',
      error: 'bg-red-400/10 text-red-400',
    },
  };

  const style = styles[type] || styles.agent;
  const styleClass = style[normalized as keyof typeof style] || style.active;

  const icon = {
    agent: '●',
    user: '◉',
    system: '◆',
  }[type];

  return (
    <span className={`text-[10px] font-medium ${styleClass} px-1.5 py-0.5 rounded uppercase`}>
      {icon} {status}
    </span>
  );
}

export interface StatusDotProps {
  status: string;
  color?: string;
}

export function StatusDot({ status, color }: StatusDotProps) {
  const normalized = status.toLowerCase().replace('_', '-');

  const baseStyle = 'w-2 h-2 rounded-full shrink-0';
  const colorStyle =
    color ||
    {
      active: '#10b981',
      completed: '#22c55e',
      failed: '#ef4444',
      running: '#3b82f6',
      queued: '#f59e0b',
      planning: '#8b5cf6',
      executing: '#fbbf24',
      verifying: '#a78bfa',
      reviewing: '#22d3ee',
      on_hold: '#6b7280',
      cancelled: '#6b7280',
    }[normalized] ||
    '#6b7280';

  return <div className={baseStyle} style={{ backgroundColor: colorStyle }} />;
}

export interface WorkflowModalProps {
  show: boolean;
  onClose: () => void;
  onStart: (goal: string, type: string) => void;
  workflowType: string;
  setWorkflowType: (type: string) => void;
  workflowGoal: string;
  setWorkflowGoal: (goal: string) => void;
  wfRunning: boolean;
}

export function WorkflowModal({
  show,
  onClose,
  onStart,
  workflowType,
  setWorkflowType,
  workflowGoal,
  setWorkflowGoal,
  wfRunning,
}: WorkflowModalProps) {
  if (!show) return null;

  const WORKFLOW_TYPES = [
    {
      id: 'feature',
      label: 'Feature',
      description: 'Full implement-verify-document cycle',
      icon: '✦',
    },
    {
      id: 'analyze',
      label: 'Analysis',
      description: 'Repository structure and dependency audit',
      icon: '◎',
    },
    {
      id: 'document',
      label: 'Documentation',
      description: 'Generate code docs and API references',
      icon: '📄',
    },
    {
      id: 'refactor',
      label: 'Refactoring',
      description: 'Clean up code with automated refactors',
      icon: '⟳',
    },
    {
      id: 'release',
      label: 'Release',
      description: 'Version bump, changelog, and tag prep',
      icon: '⬆',
    },
  ];

  const handleStart = () => {
    if (workflowGoal.trim()) {
      onStart(workflowGoal, workflowType);
    }
  };

  return (
    <VestaraModal onClose={onClose} className="max-w-4xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-(--vestara-text)">Start Workflow</h3>
          <button onClick={onClose} className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) text-base cursor-pointer">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-2">Workflow Type</label>
            <div className="grid grid-cols-2 gap-2">
              {WORKFLOW_TYPES.map((wt) => (
                <button
                  key={wt.id}
                  onClick={() => setWorkflowType(wt.id)}
                  className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${workflowType === wt.id ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active) ring-1 ring-(--vestara-accent-border)' : 'bg-(--vestara-accent-bg)/50 border-(--vestara-accent-border) hover:border-(--vestara-accent-border-hover)'}`}
                >
                  <div className="text-base mb-1">{wt.icon}</div>
                  <div className={`text-xs font-medium ${workflowType === wt.id ? 'text-(--vestara-accent-text)' : 'text-(--vestara-text-2)'}`}>
                    {wt.label}
                  </div>
                  <div className="text-[9px] text-(--vestara-text-muted) leading-tight mt-0.5">{wt.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-1.5">Goal</label>
            <textarea
              value={workflowGoal}
              onChange={(e) => setWorkflowGoal(e.target.value)}
              rows={3}
              placeholder="Describe what you want to accomplish..."
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) text-xs rounded-lg px-3 py-2 placeholder:text-(--vestara-text-dim) resize-none outline-none focus:border-(--vestara-accent-border-active)"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setWorkflowType('')}
            className="flex-1 px-3 py-2 text-xs text-(--vestara-text-2) bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={wfRunning || !workflowGoal.trim()}
            className="flex-1 px-3 py-2 text-xs font-medium text-white bg-(--vestara-accent) rounded-lg hover:opacity-90 disabled:opacity-30 transition-colors cursor-pointer"
          >
            {wfRunning ? 'Starting...' : 'Start Workflow'}
          </button>
        </div>
      </div>
    </VestaraModal>
  );
}

export interface AgentHeaderProps {
  agentFilter: string;
  setAgentFilter: (filter: string) => void;
  activeAgentCount: number;
  totalRegistered: number;
}

export function AgentHeader({ agentFilter, setAgentFilter, activeAgentCount, totalRegistered }: AgentHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        Agent Fleet{' '}
        <span className="text-zinc-700 font-normal text-[10px]">
          ({activeAgentCount}/{totalRegistered})
        </span>
      </h2>
      <div className="flex gap-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'idle', label: 'Idle' },
          { key: 'offline', label: 'Offline' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAgentFilter(key)}
            className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
              agentFilter === key ? 'bg-zinc-700 text-zinc-200 font-medium' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface ExecutionsListProps {
  executions: any[];
  agents: any[];
  formatDuration: (seconds: number) => string;
  setSelectedExecution: (execution: any) => void;
  showAllExecs: boolean;
  setShowAllExecs: (show: boolean) => void;
}

export function ExecutionsList({
  executions,
  agents,
  formatDuration,
  setSelectedExecution,
  showAllExecs,
  setShowAllExecs,
}: ExecutionsListProps) {
  const ExecutionsDetailModal = ({ execution, agents, onClose }: any) => {
    const agent = agents.find(
      (a: { id: any; name: string }) =>
        a.id === execution.agentId ||
        a.name.toLowerCase().includes(execution.agentId.split('-').pop()?.toLowerCase() || ''),
    );
    return (
      <VestaraModal onClose={onClose} className="max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex flex-col flex-1 min-h-0 p-5">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-sm font-semibold text-(--vestara-text)">Execution Details</h3>
            <button onClick={onClose} className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) text-base cursor-pointer">
              ✕
            </button>
          </div>
          <div className="space-y-3 flex-1 min-h-0 pr-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-(--vestara-text-muted) text-[10px]">Agent</span>
                <div className="text-(--vestara-text-2) text-[11px] mt-0.5">{agent?.name || execution.agentId}</div>
              </div>
              <div>
                <span className="text-(--vestara-text-muted) text-[10px]">Status</span>
                <div className="text-(--vestara-text-2) text-[11px] mt-0.5">{execution.status}</div>
              </div>
              <div>
                <span className="text-(--vestara-text-muted) text-[10px]">Started</span>
                <div className="text-(--vestara-text-2) text-[11px] mt-0.5">{new Date(execution.startedAt).toLocaleString()}</div>
              </div>
              {execution.completedAt && (
                <div>
                  <span className="text-(--vestara-text-muted) text-[10px]">Completed</span>
                  <div className="text-(--vestara-text-2) text-[11px] mt-0.5">
                    {new Date(execution.completedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-(--vestara-accent-border)">
              <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">Task</div>
              <div className="text-xs text-(--vestara-text-2) leading-relaxed bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded-lg p-3">
                {execution.task}
              </div>
            </div>
            {execution.result && (
              <div className="pt-2 border-t border-(--vestara-accent-border)">
                <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">Result</div>
                <div
                  className="text-xs text-(--vestara-text-2) leading-relaxed bg-(--vestara-accent-bg) border border-(--vestara-accent-border)/50 rounded-lg p-3 max-h-48"
                  style={{ overflowY: 'scroll' }}
                >
                  {JSON.stringify(execution.result, null, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      </VestaraModal>
    );
  };

  const [selectedExecution, setSelectedExecutionInternal] = useState<any>(null);

  const ExecutionsDetail = () => {
    if (!selectedExecution) return null;
    return (
      <ExecutionsDetailModal
        execution={selectedExecution}
        agents={agents}
        onClose={() => setSelectedExecutionInternal(null)}
      />
    );
  };

  return (
    <div>
      {executions.length > 0 && (
        <div className="mt-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Recent Executions <span className="text-zinc-700 font-normal">({executions.length})</span>
            </h3>
            {executions.length > 10 && (
              <button
                onClick={() => setShowAllExecs(!showAllExecs)}
                className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
              >
                {showAllExecs ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          <div className={`space-y-0.5 overflow-y-auto ${showAllExecs ? '' : 'max-h-52'}`}>
            {(showAllExecs ? executions : executions.slice(0, 10)).map((ex) => {
              const agent = agents.find(
                (a) =>
                  a.id === ex.agentId ||
                  a.name.toLowerCase().includes(ex.agentId.split('-').pop()?.toLowerCase() || ''),
              );
              const duration = ex.completedAt
                ? Math.round((new Date(ex.completedAt).getTime() - new Date(ex.startedAt).getTime()) / 1000)
                : null;
              return (
                <div
                  key={ex.id}
                  onClick={() => setSelectedExecutionInternal(ex)}
                  className="flex items-center gap-2 py-1 px-1 rounded hover:bg-zinc-800/20 transition-colors cursor-pointer"
                >
                  <span
                    className={`shrink-0 text-[10px] ${ex.status === 'completed' ? 'text-green-500' : ex.status === 'failed' ? 'text-red-500' : 'text-amber-400'}`}
                  >
                    {ex.status === 'completed' ? '✔' : ex.status === 'failed' ? '✗' : '◉'}
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate flex-1">{ex.task}</span>
                  <span className="text-[9px] text-zinc-700 shrink-0">{agent?.name || ex.agentId}</span>
                  <span className="text-[8px] text-zinc-700 font-mono shrink-0 w-14 text-right">
                    {duration !== null
                      ? formatDuration(duration)
                      : new Date(ex.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ExecutionsDetail />
    </div>
  );
}

export interface ProviderCardProps {
  connected: boolean;
  providerName: string;
}

export function ProviderCard({ connected, providerName }: ProviderCardProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-amber-500/60" /> Provider
      </h3>
      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Status</span>
          <span className={`flex items-center gap-1.5 ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600">Provider</span>
          <span className="text-zinc-300">{providerName}</span>
        </div>
      </div>
    </div>
  );
}

export interface SystemHealthGaugeProps {
  health: any;
}

export function SystemHealthGauge({ health }: SystemHealthGaugeProps) {
  const gaugeData = [
    { key: 'codeQuality', label: 'Code Quality', color: 'bg-green-500' },
    { key: 'testCoverage', label: 'Test Coverage', color: 'bg-blue-500' },
    { key: 'dependencyHealth', label: 'Dependencies', color: 'bg-amber-500' },
    { key: 'documentation', label: 'Documentation', color: 'bg-purple-500' },
  ];

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-green-500/60" /> System Health
      </h3>
      <div className="space-y-3">
        {gaugeData.map(({ key, label, color }) => {
          const val = health?.categories?.[key] ?? 0;
          const pct = Math.round((val / 10) * 100);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-16 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span
                    className={`text-[10px] font-medium ${val >= 7 ? 'text-green-400' : val >= 5 ? 'text-amber-400' : 'text-red-400'}`}
                  >
                    {val.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="border-t border-zinc-800 pt-2 mt-2 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Overall</span>
          <span
            className={`text-xs font-bold ${health?.overall >= 7 ? 'text-green-400' : health?.overall >= 5 ? 'text-amber-400' : 'text-red-400'}`}
          >
            {health?.overall?.toFixed(1) || '0'} / 10
          </span>
        </div>
      </div>
    </div>
  );
}

export interface PipelineStatusProps {
  stages: any[];
}

export function PipelineStatus({ stages }: PipelineStatusProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-cyan-500/60" /> Pipeline
      </h3>
      <div className="space-y-2">
        {stages.map(({ stage, status, agents: count }: { stage: string; status: boolean; agents: number }) => (
          <div key={stage} className="flex items-center gap-2.5 py-0.5">
            <div className={`w-2 h-2 rounded-full ${status ? 'bg-green-500' : 'bg-zinc-700'}`} />
            <span className={`text-[10px] font-medium ${status ? 'text-zinc-300' : 'text-zinc-600'}`}>{stage}</span>
            <span className="text-[8px] text-zinc-700 ml-auto">
              {count > 0 ? `${count} agent${count > 1 ? 's' : ''}` : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BackgroundServicesProps {
  services: any[];
  recentAgentRuns: any[];
  bgObservations: number;
  bgRunning: boolean;
  onRunBackground: () => void;
}

export function BackgroundServices({
  services,
  recentAgentRuns,
  bgObservations,
  bgRunning,
  onRunBackground,
}: BackgroundServicesProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1 h-3 rounded-full bg-zinc-500/60" /> Background
        </h3>
        <button
          onClick={onRunBackground}
          disabled={bgRunning}
          className="text-[8px] px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors cursor-pointer"
        >
          {bgRunning ? 'Running...' : 'Run All'}
        </button>
      </div>
      <div className="space-y-2">
        {services.map((svc) => {
          const isActive = recentAgentRuns.some((t: any) => t.agentId === svc.agentId && t.status === 'running');
          const totalRuns = recentAgentRuns.filter((t: any) => t.agentId === svc.agentId).length;
          return (
            <div key={svc.id} className="flex items-start gap-2.5 py-1 group">
              <div className="relative shrink-0 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full block ${isActive ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: isActive ? svc.color : '#3f3f46' }}
                />
                {isActive && (
                  <span
                    className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-40"
                    style={{ backgroundColor: svc.color }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  {svc.label}
                </div>
                <div className="text-[9px] text-zinc-700 truncate">{svc.description}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-[9px] ${isActive ? 'text-green-400' : 'text-zinc-700'}`}>
                  {isActive ? 'Active' : 'Idle'}
                </div>
                {totalRuns > 0 && <div className="text-[8px] text-zinc-700">{totalRuns}x runs</div>}
              </div>
            </div>
          );
        })}
      </div>
      {bgObservations > 0 && (
        <div className="mt-2 text-[8px] text-zinc-700 text-center border-t border-zinc-800 pt-2">
          {bgObservations} observations collected
        </div>
      )}
    </div>
  );
}

export interface ActiveSessionsPanelProps {
  activeSessions: any[];
}

export function ActiveSessionsPanel({ activeSessions }: ActiveSessionsPanelProps) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full bg-amber-500/60" /> Active Sessions
        <span className="ml-1 text-zinc-600 font-normal">({activeSessions.length})</span>
      </h3>
      <div className="space-y-2">
        {activeSessions.slice(0, 4).map((s) => {
          const pct =
            (s.metrics?.totalSteps ?? 0) > 0
              ? Math.round(((s.metrics?.completedSteps ?? 0) / (s.metrics?.totalSteps ?? 1)) * 100)
              : 0;
          return (
            <div key={s.id} className="p-2.5 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-zinc-300 font-medium truncate">{s.goal}</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded uppercase bg-blue-400/10 text-blue-400 font-medium">
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[9px] font-mono text-zinc-500">{pct}%</span>
              </div>
              {s.createdAt && (
                <div className="text-[8px] text-zinc-700 mt-1">
                  Started {new Date(s.createdAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface AlertBannerProps {
  failed: number;
  onDismiss: () => void;
}

export function AlertBanner({ failed, onDismiss }: AlertBannerProps) {
  if (failed <= 3) return null;

  return (
    <div className="mb-4">
      <Alert variant="error" onDismiss={onDismiss}>
        {failed} recent execution failures — check agent fleet for details
      </Alert>
    </div>
  );
}

export interface OpsCenterLayoutProps {
  leftPanel?: ReactNode;
  centerPanel?: ReactNode;
  rightPanel?: ReactNode;
  header?: ReactNode;
}

export function OpsCenterLayout({ leftPanel, centerPanel, rightPanel, header }: OpsCenterLayoutProps) {
  return (
    <div className="w-full px-4">
      {header}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {leftPanel && <div className="lg:col-span-3 space-y-4">{leftPanel}</div>}
        {centerPanel && <div className="lg:col-span-5">{centerPanel}</div>}
        {rightPanel && <div className="lg:col-span-4">{rightPanel}</div>}
      </div>
    </div>
  );
}
