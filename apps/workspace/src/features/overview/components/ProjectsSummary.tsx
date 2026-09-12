/**
 * VES-OVERVIEW-001: Projects Summary Component
 *
 * Marketplace rows (mpg-category-row) with glowing project tiles,
 * descriptions, and star toggles.
 */

import { MarketplaceEmptyState } from '../../../pages/Marketplace/MarketplaceLayout-components.js';
import type { OverviewProjectSummary } from '../overview.types';
import { SectionCard } from './SectionCard';

interface ProjectsSummaryProps {
  projects: readonly OverviewProjectSummary[];
}

const TILE_ACCENT = [
  'var(--vestara-status-info)',
  'var(--vestara-status-success)',
  'var(--vestara-accent-primary)',
  'var(--vestara-marketplace-primary)',
  'var(--vestara-text-muted)',
];

export function ProjectsSummary({ projects }: ProjectsSummaryProps) {
  if (projects.length === 0) {
    return (
      <SectionCard title="Projects" actionLabel="View All" actionHref="/projects" accent="var(--vestara-status-info)" index={1}>
        <MarketplaceEmptyState message="No projects yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Projects" actionLabel="View All" actionHref="/projects" accent="var(--vestara-status-info)" index={1}>
      <ul className="space-y-1">
        {projects.map((project, i) => {
          const accent = TILE_ACCENT[i % TILE_ACCENT.length];
          return (
          <li key={project.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="mpg-category-row group">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="mpg-icon-box text-white"
                  style={{
                    background: `color-mix(in srgb, ${accent} 88%, transparent)`,
                    borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
                    boxShadow: `0 0 12px color-mix(in srgb, ${accent} 35%, transparent)`,
                    width: '2rem',
                    height: '2rem',
                    fontSize: '0.85rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  {project.id === 'api' ? '⛁' : project.id === 'ui' ? '▣' : project.id === 'runtime' ? '◉' : project.id === 'tools' ? '⬣' : '</>'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                    {project.name}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                    {project.description ?? project.language ?? 'Workspace project'}
                  </span>
                </span>
              </span>
              <span aria-hidden="true" className={`shrink-0 text-[15px] transition-transform group-hover:scale-110 ${project.starred ? 'text-[var(--ov-star-active)]' : 'text-[var(--ov-star-idle)]'}`} style={project.starred ? { filter: 'drop-shadow(0 0 4px var(--ov-star-active))' } : undefined}>
                {project.starred ? '★' : '☆'}
              </span>
            </div>
          </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
