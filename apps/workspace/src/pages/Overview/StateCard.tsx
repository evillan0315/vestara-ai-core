import type { UnderstandingData } from './useUnderstanding';

export function StateCard({ data }: { data: UnderstandingData }) {
  const s = data.state;

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-blue)] rounded-lg p-5 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h2 className="text-sm font-semibold text-[var(--vestara-text)] mb-3">State</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Status</span>
          <span
            className={`font-medium capitalize ${
              s.status === 'ready' ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-amber)]'
            }`}
          >
            {s.status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Indexed</span>
          <span
            className={`font-medium ${s.isIndexed ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-text-muted)]'}`}
          >
            {s.isIndexed ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Index Freshness</span>
          <span
            className={`font-medium capitalize ${
              s.indexFreshness === 'fresh'
                ? 'text-[var(--vestara-green)]'
                : s.indexFreshness === 'stale'
                  ? 'text-[var(--vestara-amber)]'
                  : 'text-[var(--vestara-red)]'
            }`}
          >
            {s.indexFreshness}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Cached</span>
          <span
            className={`font-medium ${s.isCached ? 'text-[var(--vestara-green)]' : 'text-[var(--vestara-text-muted)]'}`}
          >
            {s.isCached ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--vestara-text-2)]">Snapshot</span>
          <span className="font-medium text-[var(--vestara-text)] text-xs font-mono">
            {data.id.slice(0, 24)}...
          </span>
        </div>
      </div>
    </div>
  );
}
