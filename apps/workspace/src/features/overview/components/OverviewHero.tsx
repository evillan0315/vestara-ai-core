/**
 * VES-OVERVIEW-001: Overview Hero Component
 *
 * The template hero: eyebrow + headline, CTAs + stats, capability
 * checklist. Rendered through the shared PageHero.
 */

import { PageHero } from '../../../components/layout/PageHero/PageHero.js';
import type { OverviewWorkspaceSummary } from '../overview.types';

interface OverviewHeroProps {
  workspace: OverviewWorkspaceSummary;
  stats?: { projects: number; agentsOnline: number; activeWork: number };
}

const CAPABILITIES = ['◇ Turn ideas into production', '◇ Orchestrate with AI agents', '◇ Build a more capable you'];

export function OverviewHero({ workspace, stats }: OverviewHeroProps) {
  const healthy = workspace.health === 'healthy';
  return (
    <PageHero
      eyebrow="Welcome to Vestara"
      title="Build Without Limits"
      subtitle="Agents. Workflows. Tools. A more capable you."
      quote="“Ideas organize. Work happens. Progress compounds.” — Vestara"
      actions={[
        { label: 'Start Building', to: '/projects', primary: true, glyph: '✦' },
        { label: 'Browse Marketplace', to: '/marketplace', glyph: '▦' },
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
              { label: 'active', value: stats.activeWork },
            ]
          : undefined
      }
      checklistTitle="A more capable tomorrow"
      checklist={CAPABILITIES}
      checklistLabel="Why extend"
      label="Workspace highlights"
    />
  );
}
