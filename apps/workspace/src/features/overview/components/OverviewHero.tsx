/**
 * VES-OVERVIEW-001: Overview Hero Component
 *
 * Marketplace hero grammar (mpg-hero + checklist + stat pills):
 * eyebrow + headline, CTAs + stats, capability checklist.
 */

import { Link } from 'react-router-dom';
import { MarketplaceStatPill } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewWorkspaceSummary } from '../overview.types';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
  stats?: { projects: number; agentsOnline: number; activeWork: number };
}

const CAPABILITIES = ['Turn ideas into production', 'Orchestrate with AI agents', 'Build a more capable you'];

export function OverviewHero({ workspace, stats }: OverviewHeroProps) {
  const healthy = workspace.health === 'healthy';
  return (
    <section className="mpg-hero mpg-enter" aria-label="Workspace highlights">
      <div className="mpg-hero-copy">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--vestara-marketplace-primary)]">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: 'var(--vestara-status-success)', boxShadow: '0 0 8px var(--vestara-status-success)' }}
          />
          Welcome to Vestara
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--vestara-text-primary)] sm:text-4xl">
          Build Without Limits
        </h1>
        <p className="mt-2 text-[15px] font-medium text-[var(--vestara-text-secondary)]">Agents. Workflows. Tools. A more capable you.</p>
        <p className="mt-4 max-w-md text-[13px] italic leading-relaxed text-[var(--vestara-text-secondary)]">
          “Ideas organize. Work happens. Progress compounds.” — Vestara
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link to="/projects" className="mpg-install-btn">
            <span aria-hidden="true">✦ </span>Start Building
          </Link>
          <Link to="/marketplace" className="mpg-pill">
            <span aria-hidden="true">▦ </span>Browse Marketplace
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
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
          {stats && (
            <>
              <MarketplaceStatPill label="projects" value={stats.projects} />
              <MarketplaceStatPill label="agents online" value={stats.agentsOnline} />
              <MarketplaceStatPill label="active" value={stats.activeWork} />
            </>
          )}
        </div>
      </div>
      <aside className="mpg-hero-checklist" aria-label="Why extend">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-marketplace-primary)]">
          A more capable tomorrow
        </p>
        <ul>
          {CAPABILITIES.map((cap) => (
            <li key={cap}>◇ {cap}</li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
