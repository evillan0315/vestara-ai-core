import { useMemo, useState } from 'react';
import type { Agent, AgentStats, Execution } from './types';

interface AgentDetailPanelProps {
  agent: Agent | null;
  stats: AgentStats | undefined;
  executions: Execution[];
  onEdit: () => void;
  onRunTask: () => void;
}

const DETAIL_TABS = ['Overview', 'Skills', 'Tools', 'Models', 'Settings'] as const;

function relativeTime(iso: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AgentDetailPanel({ agent, stats, executions, onEdit, onRunTask }: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<(typeof DETAIL_TABS)[number]>('Overview');
  const recentExecutions = useMemo(() => executions.slice(0, 3), [executions]);

  if (!agent) {
    return (
      <aside className="flex min-h-[28rem] items-center justify-center rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-5)] text-center">
        <div>
          <div className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">Select an agent</div>
          <p className="mt-1 text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
            Choose an agent from the catalog to inspect its capabilities and activity.
          </p>
        </div>
      </aside>
    );
  }

  const agentStats = stats ?? { total: 0, completed: 0, failed: 0, running: 0, avgDuration: 0 };
  const successRate = agentStats.total ? Math.round((agentStats.completed / agentStats.total) * 100) : 0;

  return (
    <aside className="flex min-h-[28rem] min-w-0 flex-col rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] xl:sticky xl:top-[var(--vestara-spacing-4)] xl:max-h-[calc(100vh-var(--vestara-spacing-8))]">
      <header className="border-b border-[var(--vestara-border-subtle)] p-[var(--vestara-spacing-4)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]" aria-hidden="true">
              ◆
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{agent.name}</h2>
              <p className="truncate text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">{agent.description || agent.role}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-[var(--vestara-radius-full)] border border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-status-success)]">
            {agent.status}
          </span>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist" aria-label={`${agent.name} details`}>
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap rounded-[var(--vestara-radius)] px-2.5 py-1.5 text-[var(--vestara-font-size-xs)] font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-[var(--vestara-accent)] text-[var(--vestara-text-primary)]' : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-[var(--vestara-spacing-4)]">
        {activeTab === 'Overview' && (
          <div className="space-y-5">
            <section>
              <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">Description</h3>
              <p className="mt-2 text-[var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
                {agent.description || 'No description has been provided for this agent.'}
              </p>
            </section>

            <section>
              <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">Capabilities</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {agent.capabilities.length > 0 ? agent.capabilities.map((capability) => (
                  <span key={capability} className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] px-2.5 py-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
                    {capability}
                  </span>
                )) : <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">No capabilities registered</span>}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">Model configuration</h3>
                <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">Authoritative registry</span>
              </div>
              <div className="mt-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] p-3">
                <p className="text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">{agent.model || 'Model not configured'}</p>
                <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">Provider: {agent.provider || 'Not configured'}</p>
              </div>
            </section>

            <section>
              <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">Statistics</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                {[
                  ['Executions', agentStats.total],
                  ['Success rate', `${successRate}%`],
                  ['Running', agentStats.running],
                  ['Avg. duration', `${agentStats.avgDuration}s`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] p-2.5">
                    <div className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{value}</div>
                    <div className="mt-0.5 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">Recent activity</h3>
                <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-accent-text)]">{recentExecutions.length} shown</span>
              </div>
              <div className="mt-2 space-y-2">
                {recentExecutions.length > 0 ? recentExecutions.map((execution) => (
                  <div key={execution.id} className="flex items-start gap-2 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] p-2.5">
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${execution.status === 'failed' ? 'bg-[var(--vestara-status-error)]' : execution.status === 'completed' ? 'bg-[var(--vestara-status-success)]' : 'bg-[var(--vestara-status-info)]'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-primary)]">{execution.task}</p>
                      <p className="mt-0.5 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{execution.status} · {relativeTime(execution.startedAt)}</p>
                    </div>
                  </div>
                )) : <p className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">No executions recorded.</p>}
              </div>
            </section>
          </div>
        )}
        {activeTab !== 'Overview' && (
          <div className="rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)] p-4">
            <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">{activeTab}</h3>
            <p className="mt-2 text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">This agent has no additional {activeTab.toLowerCase()} metadata exposed by the current registry.</p>
          </div>
        )}
      </div>

      <footer className="flex gap-2 border-t border-[var(--vestara-border-subtle)] p-[var(--vestara-spacing-4)]">
        <button type="button" onClick={onRunTask} className="min-h-9 flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent)] px-3 text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-on-accent)] hover:bg-[var(--vestara-accent-light)]">
          Run task
        </button>
        <button type="button" onClick={onEdit} className="min-h-9 flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] px-3 text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-text-primary)]">
          Edit agent
        </button>
      </footer>
    </aside>
  );
}
