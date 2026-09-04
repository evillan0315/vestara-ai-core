import { useState } from 'react';
import type { UnderstandingData } from './useUnderstanding';

/** Barrel files that are just package re-exports, not real entry points */
function isBarrelFile(path: string): boolean {
  const name = path.split('/').pop() ?? '';
  return name === 'index.ts' || name === 'index.js' || name === 'index.tsx';
}

export function ArchitectureCard({ data }: { data: UnderstandingData }) {
  const arch = data.architecture;
  const [showAll, setShowAll] = useState(false);

  // Filter out barrel index.ts files that are not real entry points
  const realEntryPoints = arch.entryPoints.filter((ep) => !isBarrelFile(ep.path));
  const barrelCount = arch.entryPoints.length - realEntryPoints.length;
  const displayPoints = showAll ? arch.entryPoints : realEntryPoints.slice(0, 12);

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-purple)] rounded-lg p-5 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h2 className="text-sm font-semibold text-[var(--vestara-text)] mb-3">Architecture</h2>

      <div className="text-sm text-[var(--vestara-text-2)] mb-3 capitalize">
        {arch.kind === 'monorepo'
          ? 'Monorepo'
          : arch.kind === 'multi-module'
            ? 'Multi-Module'
            : 'Single Module'}
        <span className="text-[var(--vestara-text-muted)] ml-2 text-xs">
          {realEntryPoints.length} entry point{realEntryPoints.length > 1 ? 's' : ''}
          {barrelCount > 0 && <span className="ml-1">(+{barrelCount} barrel)</span>}
        </span>
      </div>

      {displayPoints.length > 0 && (
        <div>
          <div className="text-xs text-[var(--vestara-text-muted)] uppercase tracking-wide mb-1.5">
            Entry Points
          </div>
          <div className="space-y-1">
            {displayPoints.map((ep, i) => (
              <div key={i} className="text-sm flex justify-between">
                <span className="text-[var(--color-zinc-300)] truncate">{ep.path}</span>
                <span className="text-[var(--vestara-text-muted)] text-xs capitalize">{ep.role}</span>
              </div>
            ))}
          </div>
          {(realEntryPoints.length > 12 || !showAll) && arch.entryPoints.length > displayPoints.length && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-[var(--vestara-accent-text)] hover:text-[var(--vestara-accent-text-hover)] mt-1.5 cursor-pointer transition-colors"
            >
              {showAll
                ? 'Show fewer'
                : `Show all ${arch.entryPoints.length} (${barrelCount} barrel files filtered)`}
            </button>
          )}
        </div>
      )}

      {arch.layers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-zinc-800)]">
          <div className="text-xs text-[var(--vestara-text-muted)] uppercase tracking-wide mb-1.5">
            Layers
          </div>
          <div className="space-y-1">
            {arch.layers.map((l, i) => (
              <div key={i} className="text-sm flex justify-between">
                <span className="text-[var(--color-zinc-300)]">{l.packageName}</span>
                <span className="text-[var(--vestara-text-muted)] capitalize">{l.layer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {arch.dependencyCycles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-zinc-800)]">
          <div className="text-xs text-[var(--vestara-red)] uppercase tracking-wide">
            {arch.dependencyCycles.length} circular dependenc
            {arch.dependencyCycles.length > 1 ? 'ies' : 'y'}
          </div>
        </div>
      )}
    </div>
  );
}
