/**
 * VES-OVERVIEW-001: Overview Hero Component
 *
 * Compact hero using the same bounded surface and fact-chip grammar as
 * Settings. Detailed work stays below the tab section.
 */

import { useState, type ReactNode } from 'react';
import { StatusIndicator } from '@vestara/ui';
import { WorkspacePanelIcon } from '../../../components/WorkspaceOperationalPanel.js';
import { navIcon } from '../../../layouts/workspace-navigation.js';
import type { MorningBriefing } from '../../../hooks/useMorningBriefing';
import type { OverviewWorkspaceSummary } from '../overview.types';
import { formatClockTime } from '../utils/timeAgo';
import '../../../pages/Settings/settings.tokens.css';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
  stats?: { focusPct: number };
  briefing?: MorningBriefing | null;
  briefingLoading?: boolean;
}

function getTimeBasedGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function summarizeBriefing(briefing: MorningBriefing): string {
  const repoHealth = briefing.details.repoHealth || '';
  const branch = repoHealth.match(/Branch:\s*(\S+)/)?.[1] ?? 'main';
  const buildMissing = repoHealth.includes('MISSING');
  const modifiedCount = (repoHealth.match(/^\s*M\s/gm) || []).length;
  const parts = [`branch '${branch}'`, buildMissing ? 'build missing' : 'build ready'];
  if (modifiedCount > 0) parts.push(`${modifiedCount} modified files`);
  return parts.join(' · ');
}

function HeroFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="st-hero-chip min-w-0">
      <div className="st-gap-field flex min-h-14 min-w-0 items-center">
        <span aria-hidden="true" className="shrink-0 text-[var(--vestara-accent-text)] [&_svg]:size-5">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="st-hero-chip-label">{label}</span>
          <span className="st-hero-chip-value truncate">{value}</span>
        </span>
      </div>
    </div>
  );
}

export function OverviewHero({ workspace, stats, briefing, briefingLoading }: OverviewHeroProps) {
  const healthy = workspace.health === 'healthy';
  const greeting = getTimeBasedGreeting();
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  const briefingSummary = briefing ? summarizeBriefing(briefing) : null;

  return (
    <>
      <section className="st-panel st-hero-surface st-pad-card border border-[color-mix(in_srgb,var(--vestara-accent)_42%,var(--vestara-border-subtle))]">
        <div className="st-gap-section flex min-w-0 flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="st-gap-field flex min-w-0 items-center lg:max-w-[34rem]">
            <WorkspacePanelIcon icon={navIcon('home')} tone="info" />
            <div className="min-w-0">
              <p className="st-hero-chip-label">Workspace overview</p>
              <h1 className="text-[var(--vestara-font-size-2xl)] font-semibold text-[var(--vestara-text-primary)]">
                Overview
              </h1>
              <p className="st-mt-element text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
                {greeting}, Director. Continue where you left off.
              </p>
            </div>
          </div>
          <div className="st-gap-field grid min-w-0 sm:grid-cols-3 lg:w-[min(48rem,60%)]">
            <HeroFact icon={navIcon('files')} label="Workspace" value={workspace.name} />
            <HeroFact
              icon={<StatusIndicator variant={healthy ? 'live' : 'warn'} size="xs" pulse={healthy} />}
              label="Health"
              value={healthy ? 'Healthy' : workspace.health}
            />
            {stats && <HeroFact icon={navIcon('activity')} label="Focus complete" value={`${stats.focusPct}%`} />}
          </div>
        </div>
      </section>

      {/* Briefing strip — collapsed single line, expands for full detail */}
      {briefing && briefingSummary && (
        <button
          type="button"
          onClick={() => setBriefingExpanded((v) => !v)}
          aria-expanded={briefingExpanded}
          aria-label={`${briefingExpanded ? 'Collapse' : 'Expand'} ${greeting.toLowerCase()} briefing`}
          title={briefingExpanded ? 'Collapse briefing' : 'Expand briefing'}
          className="flex w-full items-center gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-amber-border)] bg-[var(--vestara-amber-bg)] px-4 py-2.5 text-left text-[12px] leading-snug text-[var(--vestara-text-secondary)]"
        >
          <span aria-hidden="true" className="shrink-0 text-[var(--vestara-amber)]">
            ☀️
          </span>
          <span className={`min-w-0 flex-1 ${briefingExpanded ? '' : 'truncate'}`}>
            <span className="font-medium text-[var(--vestara-text-primary)]">{greeting} briefing</span>
            {' — '}
            {briefingSummary}
            <span className="ml-1.5 text-[var(--vestara-text-muted)]">{formatClockTime(briefing.executedAt)}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-[var(--vestara-text-muted)]">
            {briefingExpanded ? '▴' : '▾'}
          </span>
        </button>
      )}
      {briefingLoading && !briefing && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-dashed border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-4 py-2.5 text-[12px] text-[var(--vestara-text-muted)] animate-pulse"
        >
          Preparing your briefing…
        </div>
      )}
    </>
  );
}
