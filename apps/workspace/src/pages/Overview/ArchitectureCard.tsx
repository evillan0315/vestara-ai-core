import type { UnderstandingData } from './useUnderstanding';

export function ArchitectureCard({ data }: { data: UnderstandingData }) {
  const arch = data.architecture;

  return (
    <div className="bg-[var(--color-zinc-900)] rounded-lg p-5 border border-[var(--color-zinc-700)]">
      <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-3">Architecture</h2>

      <div className="text-sm text-[var(--vestara-text-2)] mb-3 capitalize">
        {arch.kind === 'monorepo' ? 'Monorepo' : arch.kind === 'multi-module' ? 'Multi-Module' : 'Single Module'}
      </div>

      {arch.entryPoints.length > 0 && (
        <div>
          <div className="text-xs text-[var(--vestara-text-muted)] uppercase tracking-wide mb-1.5">Entry Points</div>
          <div className="space-y-1">
            {arch.entryPoints.map((ep, i) => (
              <div key={i} className="text-sm flex justify-between">
                <span className="text-[var(--color-zinc-300)] truncate">{ep.path.split('/').pop()}</span>
                <span className="text-[var(--vestara-text-muted)] text-xs capitalize">{ep.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {arch.layers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-zinc-800)]">
          <div className="text-xs text-[var(--vestara-text-muted)] uppercase tracking-wide mb-1.5">Layers</div>
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
            {arch.dependencyCycles.length} circular dependenc{arch.dependencyCycles.length > 1 ? 'ies' : 'y'}
          </div>
        </div>
      )}
    </div>
  );
}