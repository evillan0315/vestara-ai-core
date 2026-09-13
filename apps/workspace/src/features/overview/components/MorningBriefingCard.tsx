/**
 * VES-OVERVIEW-MORNING: Morning Briefing Card for Overview/Home
 *
 * Small info on Home/Overview with exact executed timestamp.
 * Click opens detailed modal with repo health, workspace status, activity.
 */

import { useState } from 'react';
import { SectionCard } from './SectionCard';
import type { MorningBriefing } from '../../../hooks/useMorningBriefing';

function formatExecutedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function MorningBriefingCard({ briefing, loading }: { briefing: MorningBriefing | null; loading?: boolean }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <SectionCard title="Morning Briefing" accent="var(--vestara-amber)" index={0}>
        <div className="mpg-skeleton h-16" />
      </SectionCard>
    );
  }

  if (!briefing) {
    return (
      <SectionCard title="Morning Briefing" accent="var(--vestara-amber)" index={0}>
        <div className="text-center py-6">
          <div className="text-sm text-[var(--vestara-text-muted)]">No briefing yet</div>
          <div className="text-xs text-[var(--vestara-text-dim)] mt-1">Runs daily at 08:00 local via schedule</div>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Morning Briefing" accent="var(--vestara-amber)" index={0} actionLabel="View detail" actionHref="#">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-lg border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] p-3 hover:border-[var(--vestara-accent-border-hover)] transition-colors cursor-pointer"
          aria-label="Open morning briefing detail"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-[var(--vestara-text-primary)] truncate">{briefing.summary}</div>
              <div className="text-[11px] text-[var(--vestara-text-muted)] mt-0.5 line-clamp-2">
                {briefing.details.repoHealth?.slice(0, 90) || briefing.details.fullContent?.slice(0, 90) || 'Repo health • Workspace status • Activity'}
              </div>
            </div>
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-[var(--vestara-amber)]/30 bg-[var(--vestara-amber)]/10 text-[var(--vestara-amber)]">
              {timeAgo(briefing.executedAt)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--vestara-text-dim)]">
            <span>🕒 {formatExecutedAt(briefing.executedAt)}</span>
            <span>·</span>
            <span>Click for detail</span>
          </div>
        </button>
      </SectionCard>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Morning briefing detail"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-xl border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--vestara-text-primary)]">Morning Briefing</h2>
                <p className="text-xs text-[var(--vestara-text-muted)]">Executed: {formatExecutedAt(briefing.executedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg border border-[var(--vestara-border-default)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-amber)]">Summary</h3>
                <p className="mt-1 text-[var(--vestara-text)]">{briefing.summary}</p>
                <p className="text-xs text-[var(--vestara-text-dim)] mt-1">ID: {briefing.id} · Created: {formatExecutedAt(briefing.createdAt)}</p>
              </section>
              {briefing.details.repoHealth && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-muted)]">Repo Health (build/test/lint)</h3>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--vestara-surface-panel-raised)] border border-[var(--vestara-border-subtle)] p-3 text-xs text-[var(--vestara-text-secondary)]">{briefing.details.repoHealth}</pre>
                </section>
              )}
              {briefing.details.workspaceStatus && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-muted)]">Workspace Status</h3>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--vestara-surface-panel-raised)] border border-[var(--vestara-border-subtle)] p-3 text-xs text-[var(--vestara-text-secondary)]">{briefing.details.workspaceStatus}</pre>
                </section>
              )}
              {briefing.details.activity && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-muted)]">Activity Room — OpenCode Sessions</h3>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--vestara-surface-panel-raised)] border border-[var(--vestara-border-subtle)] p-3 text-xs text-[var(--vestara-text-secondary)]">{briefing.details.activity}</pre>
                </section>
              )}
              {briefing.details.fullContent && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-muted)]">Full Content</h3>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--vestara-surface-panel-raised)] border border-[var(--vestara-border-subtle)] p-3 text-xs text-[var(--vestara-text-secondary)]">{briefing.details.fullContent}</pre>
                </section>
              )}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[var(--vestara-accent)] px-4 py-1.5 text-xs font-medium text-white hover:opacity-90">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
