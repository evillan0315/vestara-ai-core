import type { UnderstandingData } from './useUnderstanding';

export function StateCard({ data }: { data: UnderstandingData }) {
  const s = data.state;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-5">
      <h2 className="text-lg font-semibold text-(--vestara-text) mb-3">State</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-(--vestara-text-2)">Status</span>
          <span
            className={`font-medium capitalize ${
              s.status === 'ready' ? 'text-[--vestara-green]' : 'text-amber-500'
            }`}
          >
            {s.status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-(--vestara-text-2)">Indexed</span>
          <span
            className={`font-medium ${s.isIndexed ? 'text-[--vestara-green]' : 'text-(--vestara-text-muted)'}`}
          >
            {s.isIndexed ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-(--vestara-text-2)">Index Freshness</span>
          <span
            className={`font-medium capitalize ${
              s.indexFreshness === 'fresh'
                ? 'text-[--vestara-green]'
                : s.indexFreshness === 'stale'
                  ? 'text-amber-500'
                  : 'text-(--vestara-red)'
            }`}
          >
            {s.indexFreshness}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-(--vestara-text-2)">Cached</span>
          <span
            className={`font-medium ${s.isCached ? 'text-[--vestara-green]' : 'text-(--vestara-text-muted)'}`}
          >
            {s.isCached ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-(--vestara-text-2)">Snapshot</span>
          <span className="font-medium text-(--vestara-text) text-xs font-mono">{data.id.slice(0, 24)}...</span>
        </div>
      </div>
    </div>
  );
}
