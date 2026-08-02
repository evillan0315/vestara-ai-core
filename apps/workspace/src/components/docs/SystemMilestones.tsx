/**
 * SystemMilestones — a live status strip on the Documentation page that ties
 * the engineering docs to the three delivered milestones: durable agent
 * execution, engineering event projection, and the real-time workflow
 * lifecycle.
 */

import { useEffect, useState } from 'react';

interface MilestoneCard {
  id: string;
  title: string;
  description: string;
  href: string;
  accent: string;
  value: string;
  valueLabel: string;
  badge: string;
}

export function SystemMilestones() {
  const [threads, setThreads] = useState<Array<{ id: string; status: string }>>([]);
  const [sessions, setSessions] = useState<Array<{ workflowId?: string; status: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [threadRes, sessionRes] = await Promise.all([
          fetch('/api/agent-threads').then((r) => (r.ok ? r.json() : { threads: [] })),
          fetch('/api/sessions/executions').then((r) => (r.ok ? r.json() : { sessions: [] })),
        ]);
        if (cancelled) return;
        setThreads(threadRes.threads ?? []);
        setSessions(sessionRes.sessions ?? []);
      } catch {
        /* best-effort */
      }
    };
    void load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const running = threads.filter((thread) => thread.status === 'running' || thread.status === 'active').length;
  const harnessSessions = sessions.filter((session) => (session.workflowId ?? '').startsWith('thread:'));
  const activeWorkflows = harnessSessions.filter((session) => session.status === 'running').length;

  const cards: MilestoneCard[] = [
    {
      id: 'execution',
      title: 'Durable Agent Execution',
      description: 'AgentHarnessRuntime is the single execution path — durable threads, approvals, restart-safe queues.',
      href: '/agents',
      accent: 'text-(--vestara-blue)',
      value: String(threads.length),
      valueLabel: 'threads ·',
      badge: running > 0 ? `${running} running` : 'idle',
    },
    {
      id: 'events',
      title: 'Engineering Event Projection',
      description: 'harness.* and change.* events project filesystem + git diffs into the temporal event store.',
      href: '/execution',
      accent: 'text-(--vestara-green)',
      value: String(harnessSessions.length),
      valueLabel: 'harness sessions',
      badge: 'event-sourced',
    },
    {
      id: 'workflow',
      title: 'Real-Time Workflow Lifecycle',
      description: 'Canonical eight-stage projection streamed to the TUI and Workspace with monotonic sequences.',
      href: '/sessions',
      accent: 'text-(--vestara-amber)',
      value: activeWorkflows > 0 ? String(activeWorkflows) : '—',
      valueLabel: 'active',
      badge: 'live',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      {cards.map((card) => (
        <a
          key={card.id}
          href={card.href}
          className="p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors block"
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold ${card.accent}`}>{card.title}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted) uppercase">
              {card.badge}
            </span>
          </div>
          <div className="text-[9px] text-(--vestara-text-muted) mt-1 leading-snug line-clamp-2">{card.description}</div>
          <div className="text-[10px] text-(--vestara-text-2) mt-1.5">
            <span className="text-sm font-bold text-(--vestara-text)">{card.value}</span> {card.valueLabel}
          </div>
        </a>
      ))}
    </div>
  );
}
