/**
 * VES-OVERVIEW-001: Overview Hero Component
 *
 * Compact hero: time-aware greeting, workspace health, stat counters.
 * Morning briefing rendered as a single-line strip below the hero.
 */

import { useState } from 'react';
import { RouteHero } from '../../../components/layout/PageHero/RouteHero';
import type { MorningBriefing } from '../../../hooks/useMorningBriefing';
import type { OverviewWorkspaceSummary } from '../overview.types';
import { formatClockTime } from '../utils/timeAgo';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
  stats?: { projects: number; agentsOnline: number; focusPct: number };
  briefing?: MorningBriefing | null;
  briefingLoading?: boolean;
}

function formatTime(iso: string): string {
  return formatClockTime(iso);
}

function getTimeBasedGreeting(now = new Date()): { greeting: string; period: string } {
  const h = now.getHours();
  if (h < 12) return { greeting: 'Good Morning', period: 'morning' };
  if (h < 18) return { greeting: 'Good Afternoon', period: 'afternoon' };
  return { greeting: 'Good Evening', period: 'evening' };
}

function summarizeBriefing(briefing: MorningBriefing): string {
  const rh = briefing.details.repoHealth || '';
  const branch = rh.match(/Branch:\s*(\S+)/)?.[1] ?? 'main';
  const buildMissing = rh.includes('MISSING');
  const modifiedCount = (rh.match(/^\s*M\s/mg) || []).length;

  const parts: string[] = [];
  parts.push(`branch '${branch}'`);
  parts.push(buildMissing ? 'build missing' : 'build ready');
  if (modifiedCount > 0) parts.push(`${modifiedCount} modified files`);
  return parts.join(' · ');
}

export function OverviewHero({ workspace, stats, briefing, briefingLoading }: OverviewHeroProps) {
  const healthy = workspace.health === 'healthy';
  const { greeting } = getTimeBasedGreeting();
  const stableTitle = `${greeting} Director`;
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  const briefingSummary = briefing ? summarizeBriefing(briefing) : null;

  return (
    <>
      <RouteHero
        title={stableTitle}
        eyebrow={`Welcome to Vestara · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        actions={[
          { label: 'Activity Room', to: '/activity', glyph: '▦' },
          { label: 'Terminal', to: '/terminal', glyph: '›' },
        ]}
        meta={
          <span className="mpg-tag-pill" style={{ color: 'var(--vestara-text-secondary)' }}>
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)',
                boxShadow: `0 0 6px ${healthy ? 'var(--vestara-status-success)' : 'var(--vestara-status-warning)'}`,
              }}
            />
            {workspace.name} · {healthy ? 'Healthy' : workspace.health}
          </span>
        }
        stats={
          stats
            ? [
                { label: 'projects', value: stats.projects },
                { label: 'agents online', value: stats.agentsOnline },
                { label: 'focus done', value: `${stats.focusPct}%` },
              ]
            : undefined
        }
      />

      {/* Briefing strip — collapsed single line, expands for full detail */}
      {briefing && briefingSummary && (
        <button
          type="button"
          onClick={() => setBriefingExpanded((v) => !v)}
          aria-expanded={briefingExpanded}
          title={briefingExpanded ? 'Collapse briefing' : 'Expand briefing'}
          className="mt-3 flex w-full items-center gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-amber-border)] bg-[var(--vestara-amber-bg)] px-4 py-2.5 text-left text-[12px] leading-snug text-[var(--vestara-text-secondary)]"
        >
          <span aria-hidden="true" className="shrink-0 text-[var(--vestara-amber)]">
            ☀️
          </span>
          <span className={`min-w-0 flex-1 ${briefingExpanded ? '' : 'truncate'}`}>
            <span className="font-medium text-[var(--vestara-text-primary)]">{greeting} briefing</span>
            {' — '}
            {briefingSummary}
            <span className="ml-1.5 text-[var(--vestara-text-muted)]">{formatTime(briefing.executedAt)}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-[var(--vestara-text-muted)]">
            {briefingExpanded ? '▴' : '▾'}
          </span>
        </button>
      )}
      {briefingLoading && !briefing && (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-2.5 text-[12px] text-[var(--vestara-text-muted)] animate-pulse">
          Preparing your {getTimeBasedGreeting().period} briefing…
        </div>
      )}
    </>
  );
}
