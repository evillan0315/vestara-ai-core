/**
 * Files — filesystem capability operations surface.
 *
 * Thin reuse of the execution FilesystemPanel (no new domain UI):
 * fixes the dead /files link QuickActions already points at and gives
 * the sidebar "Files" entry a real page.
 *
 * Dashboard derives only from the authoritative
 * GET /api/execution/filesystem payload — no invented activity.
 */

import { useEffect, useMemo, useState } from 'react';
import { ExecutionProvider } from '../components/execution/ExecutionContext';
import { FilesystemPanel } from '../components/execution/filesystem';
import { RouteHero } from '../components/layout/PageHero/RouteHero';
import { executionApi, tone, type FsOperation } from '../lib/execution';
import '../styles/execution.css';

function FilesDashboard() {
  const [ops, setOps] = useState<FsOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void executionApi.filesystem(300).then((d) => {
      if (cancelled) return;
      setOps(d?.operations ?? []);
      setTotal(d?.total ?? 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboard = useMemo(() => {
    const byType = new Map<string, number>();
    const byAgent = new Map<string, number>();
    let failed = 0;
    let passed = 0;
    for (const op of ops) {
      byType.set(op.operation, (byType.get(op.operation) ?? 0) + 1);
      byAgent.set(op.agent, (byAgent.get(op.agent) ?? 0) + 1);
      const t = tone(op.status);
      if (t === 'fail') failed += 1;
      if (t === 'pass') passed += 1;
    }
    return {
      failed,
      agents: byAgent.size,
      successRate: ops.length > 0 ? Math.round((passed / ops.length) * 100) : 0,
      types: [...byType.entries()].sort(([, a], [, b]) => b - a).slice(0, 6),
      agentsTop: [...byAgent.entries()].sort(([, a], [, b]) => b - a).slice(0, 5),
      maxType: Math.max(1, ...byType.values()),
    };
  }, [ops]);

  return (
    <section aria-labelledby="files-dashboard-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-accent)]">
            Operational overview
          </p>
          <h2
            id="files-dashboard-title"
            className="mt-1 text-base font-semibold text-[var(--vestara-text-primary)]"
          >
            Files dashboard
          </h2>
        </div>
        <span className="text-[11px] text-[var(--vestara-text-muted)]">
          {loading ? 'Loading current state…' : `${ops.length} recent operations tracked`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total operations', value: total, tone: 'var(--vestara-accent)' },
          { label: 'Agents active', value: dashboard.agents, tone: 'var(--vestara-status-info)' },
          { label: 'Success rate', value: `${dashboard.successRate}%`, tone: 'var(--vestara-status-success)' },
          { label: 'Failed', value: dashboard.failed, tone: 'var(--vestara-status-error)' },
        ].map((item) => (
          <div key={item.label} className="mpg-card min-w-0 p-4">
            <span className="mpg-card-accent" style={{ background: item.tone }} aria-hidden="true" />
            <div className="relative z-[2]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--vestara-text-muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--vestara-text-primary)]">
                {loading ? '—' : item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
        <div className="mpg-card p-4">
          <div className="relative z-[2]">
            <h3 className="text-xs font-semibold text-[var(--vestara-text-primary)]">Operations by type</h3>
            {dashboard.types.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {dashboard.types.map(([type, count]) => (
                  <li key={type}>
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="truncate font-mono text-[var(--vestara-accent)]">{type}</span>
                      <span className="shrink-0 tabular-nums text-[var(--vestara-text-muted)]">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--vestara-accent-bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--vestara-accent)] transition-[width] duration-300"
                        style={{ width: `${Math.round((count / dashboard.maxType) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-[var(--vestara-text-muted)]">
                {loading ? 'Loading…' : 'No operations recorded yet.'}
              </p>
            )}
          </div>
        </div>

        <div className="mpg-card p-4">
          <div className="relative z-[2]">
            <h3 className="text-xs font-semibold text-[var(--vestara-text-primary)]">Most active agents</h3>
            {dashboard.agentsTop.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {dashboard.agentsTop.map(([agent, count]) => (
                  <li
                    key={agent}
                    className="flex items-center justify-between gap-3 text-[11px] text-[var(--vestara-text-secondary)]"
                  >
                    <span className="truncate font-mono">{agent}</span>
                    <span className="mpg-tag-pill shrink-0">{count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-[var(--vestara-text-muted)]">
                {loading ? 'Loading…' : 'No agent activity yet.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Files() {
  return (
    <div className="space-y-4">
      <RouteHero />
      <FilesDashboard />
      <ExecutionProvider>
        <FilesystemPanel />
      </ExecutionProvider>
    </div>
  );
}
