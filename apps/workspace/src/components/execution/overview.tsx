/**
 * Execution overview — metric cards + metrics tab.
 */

import { formatDuration } from '../../lib/execution';
import { useExecution } from './ExecutionContext';

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}

function Card({ label, value, sub, tone = 'neutral' }: CardProps) {
  const color =
    tone === 'ok'
      ? 'var(--vestara-green, #4ade80)'
      : tone === 'warn'
        ? 'var(--vestara-amber, #f59e0b)'
        : tone === 'bad'
          ? 'var(--vestara-red, #f87171)'
          : 'var(--vestara-accent, #f59e0b)';
  return (
    <div className="exec-card" style={{ borderTopColor: color }}>
      <span className="exec-card-label">{label}</span>
      <div className="exec-card-value" style={{ color }}>
        {value}
      </div>
      {sub && <div className="exec-card-sub">{sub}</div>}
    </div>
  );
}

export function OverviewCards() {
  const { dashboard } = useExecution();
  const m = dashboard?.metrics;
  const agents = dashboard?.agents ?? [];

  const activeAgents = agents.filter((a) => a.status !== 'idle' && a.status !== 'completed').length;
  const waitingApprovals = dashboard?.approvals?.length ?? m?.approvalsPending ?? 0;
  const failed = (dashboard?.queueSummary.failed ?? 0) + (dashboard?.queueSummary.blocked ?? 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
      <Card
        label="Projects"
        value={dashboard ? String(dashboard.projects.length) : '…'}
        sub="running projects"
        tone="ok"
      />
      <Card
        label="Plans"
        value={dashboard ? String(dashboard.plans.length) : '…'}
        sub={m ? `${m.plans.executing} executing` : undefined}
        tone={m && m.plans.executing > 0 ? 'warn' : 'ok'}
      />
      <Card
        label="Tasks"
        value={m ? String(m.tasks.total) : '…'}
        sub={m ? `${m.tasks.running} running · ${m.tasks.blocked} blocked` : undefined}
        tone={m && m.tasks.blocked > 0 ? 'bad' : 'ok'}
      />
      <Card
        label="Running Agents"
        value={agents.length ? String(activeAgents) : '…'}
        sub={agents.length ? `${agents.length} registered` : undefined}
        tone={activeAgents > 0 ? 'warn' : 'ok'}
      />
      <Card label="Queued Jobs" value={m ? String(m.queueLength) : '…'} sub="sessions + pending tasks" tone="neutral" />
      <Card
        label="Approvals"
        value={dashboard ? String(waitingApprovals) : '…'}
        sub={waitingApprovals > 0 ? 'waiting decision' : 'all clear'}
        tone={waitingApprovals > 0 ? 'warn' : 'ok'}
      />
      <Card
        label="Failures"
        value={dashboard ? String(failed) : '…'}
        sub="failed + blocked"
        tone={failed > 0 ? 'bad' : 'ok'}
      />
      <Card
        label="Success Rate"
        value={m ? `${m.sessions.successRate}%` : '…'}
        sub={m ? `sessions · ${m.executions.successRate}% executions` : undefined}
        tone={m ? (m.sessions.successRate >= 80 ? 'ok' : m.sessions.successRate >= 50 ? 'warn' : 'bad') : 'neutral'}
      />
      <Card
        label="Avg Session"
        value={m ? formatDuration(m.sessions.avgDurationMs) : '…'}
        sub={m ? `${m.sessions.total} total` : undefined}
        tone="neutral"
      />
      <Card
        label="Agent Utilization"
        value={m ? `${m.agents.utilization}%` : '…'}
        sub={m ? `${m.agents.active} active` : undefined}
        tone="neutral"
      />
      <Card label="Filesystem Ops" value={m ? String(m.fsOps) : '…'} sub="file operations" tone="ok" />
      <Card label="Artifacts" value={m ? String(m.artifacts) : '…'} sub="change sets + reports" tone="ok" />
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-right">
        <span className="text-[11.5px] text-zinc-200 font-mono">{value}</span>
        {sub && <span className="block text-[10px] text-zinc-600">{sub}</span>}
      </span>
    </div>
  );
}

export function MetricsPanel() {
  const { dashboard } = useExecution();
  const m = dashboard?.metrics;
  if (!m) return <p className="exec-empty">No metrics yet</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Execution Sessions</div>
        <MetricRow label="Total" value={String(m.sessions.total)} />
        <MetricRow label="Running / Queued" value={`${m.sessions.running} / ${m.sessions.queued}`} />
        <MetricRow label="Completed" value={String(m.sessions.completed)} />
        <MetricRow label="Failed / Cancelled" value={`${m.sessions.failed} / ${m.sessions.cancelled}`} />
        <MetricRow label="Success rate" value={`${m.sessions.successRate}%`} />
        <MetricRow label="Avg duration" value={formatDuration(m.sessions.avgDurationMs)} />
      </div>
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Agent Executions</div>
        <MetricRow label="Total" value={String(m.executions.total)} />
        <MetricRow label="Running" value={String(m.executions.running)} />
        <MetricRow label="Completed" value={String(m.executions.completed)} />
        <MetricRow label="Failed" value={String(m.executions.failed)} />
        <MetricRow label="Success rate" value={`${m.executions.successRate}%`} />
        <MetricRow label="Avg duration" value={formatDuration(m.executions.avgDurationMs)} />
      </div>
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Plans & Tasks</div>
        <MetricRow label="Plans total" value={String(m.plans.total)} />
        <MetricRow label="Approved / Executing" value={`${m.plans.approved} / ${m.plans.executing}`} />
        <MetricRow label="Plans completed / cancelled" value={`${m.plans.completed} / ${m.plans.cancelled}`} />
        <MetricRow label="Tasks total" value={String(m.tasks.total)} />
        <MetricRow
          label="Running / Blocked / Pending"
          value={`${m.tasks.running} / ${m.tasks.blocked} / ${m.tasks.pending}`}
        />
        <MetricRow label="Tasks completed" value={String(m.tasks.completed)} />
      </div>
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Runtime</div>
        <MetricRow label="Agents" value={String(m.agents.total)} />
        <MetricRow label="Active / Utilization" value={`${m.agents.active} / ${m.agents.utilization}%`} />
        <MetricRow label="Queue length" value={String(m.queueLength)} />
        <MetricRow label="Filesystem operations" value={String(m.fsOps)} />
        <MetricRow label="Artifacts" value={String(m.artifacts)} />
        <MetricRow label="Pending approvals" value={String(m.approvalsPending)} />
      </div>
    </div>
  );
}
