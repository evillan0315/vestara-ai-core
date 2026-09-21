import { useEffect, useMemo, useState } from 'react';
import { GalleryCard } from '../../pages/Marketplace/MarketplaceLayout-components.js';
import { fetchCodexRuntimeStatus, type CodexRuntimeStatus } from '../../lib/codex';

interface CodexRuntimeActivityCardProps {
  readonly variant?: 'overview' | 'activity-panel';
}

function formatAge(value: string | undefined): string {
  if (!value) return 'never';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusLabel(status: CodexRuntimeStatus | null): string {
  if (!status) return 'Unknown';
  return status.reachable ? 'Connected' : 'Unreachable';
}

function statusTone(status: CodexRuntimeStatus | null): string {
  if (!status) return 'var(--vestara-text-muted)';
  return status.reachable ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)';
}

function statusClassName(status: CodexRuntimeStatus | null): string {
  if (!status) return 'text-[var(--vestara-text-muted)]';
  return status.reachable ? 'text-[var(--vestara-status-success)]' : 'text-[var(--vestara-status-warning)]';
}

function statusDotClassName(status: CodexRuntimeStatus | null): string {
  if (!status) return 'bg-[var(--vestara-text-muted)]';
  return status.reachable ? 'bg-[var(--vestara-status-success)]' : 'bg-[var(--vestara-status-warning)]';
}

function useCodexRuntimeStatus(): CodexRuntimeStatus | null {
  const [status, setStatus] = useState<CodexRuntimeStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = (signal?: AbortSignal) => {
      void fetchCodexRuntimeStatus(signal).then((next) => {
        if (mounted) setStatus(next);
      });
    };
    const controller = new AbortController();
    load(controller.signal);
    const interval = window.setInterval(() => load(), 5_000);
    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return status;
}

function RuntimeRows({ status }: { readonly status: CodexRuntimeStatus | null }) {
  const sessions = status?.sessions ?? [];
  const threadCount = sessions.reduce((sum, session) => sum + session.threadCount, 0);
  const turnCount = sessions.reduce((sum, session) => sum + session.turnsStarted, 0);
  const latestSession = sessions
    .slice()
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())[0];
  const recentThreads = sessions.flatMap((session) =>
    session.threads.map((thread) => ({ ...thread, runtimeSessionId: session.id })),
  ).slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Sessions', value: sessions.length },
          { label: 'Threads', value: threadCount },
          { label: 'Clients', value: status?.connectedClients ?? 0 },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2 py-2"
          >
            <p className="text-[14px] font-semibold tabular-nums text-[var(--vestara-text-primary)]">{metric.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-[var(--vestara-text-muted)]">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-[12px] text-[var(--vestara-text-secondary)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--vestara-text-muted)]">App Server</span>
          <span className="truncate font-medium" title={status?.upstream.url ?? 'No status loaded'}>
            {status?.upstream.url ?? 'checking'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--vestara-text-muted)]">Recent session</span>
          <span className="truncate font-medium">{latestSession?.id ?? 'none'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--vestara-text-muted)]">Last event</span>
          <span className="font-medium">{formatAge(latestSession?.lastEventAt ?? latestSession?.lastSeenAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--vestara-text-muted)]">Turns started</span>
          <span className="font-medium tabular-nums">{turnCount}</span>
        </div>
      </div>

      {recentThreads.length > 0 && (
        <div className="space-y-1">
          {recentThreads.map((thread) => (
            <div
              key={`${thread.runtimeSessionId}:${thread.id}`}
              className="flex items-center justify-between gap-2 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2 py-1.5 text-[11px]"
            >
              <span className="min-w-0 truncate text-[var(--vestara-text-secondary)]" title={thread.preview ?? thread.id}>
                {thread.preview ?? thread.id}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--vestara-text-muted)]">
                {thread.source ?? `${thread.bufferedEvents} events`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CodexRuntimeActivityCard({ variant = 'overview' }: CodexRuntimeActivityCardProps) {
  const status = useCodexRuntimeStatus();
  const label = statusLabel(status);
  const tone = statusTone(status);
  const statusClass = statusClassName(status);
  const dotClass = statusDotClassName(status);
  const badge = useMemo(() => (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${statusClass}`}>
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`}
      />
      {label}
    </span>
  ), [dotClass, label, statusClass]);

  if (variant === 'activity-panel') {
    return (
      <div className="ar-context__section">
        <div className="ar-context__section-header">
          <h3 className="ar-context__title">Codex App Server</h3>
          {badge}
        </div>
        <RuntimeRows status={status} />
      </div>
    );
  }

  return (
    <section aria-label="Codex App Server activity" className="mpg-enter">
      <GalleryCard accent={tone}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">Codex App Server</h2>
          {badge}
        </div>
        <RuntimeRows status={status} />
      </GalleryCard>
    </section>
  );
}
