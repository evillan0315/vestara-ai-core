import type { UnderstandingData } from './useUnderstanding';

const DESC_MAX_LENGTH = 80;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

export function ActivityCard({ data }: { data: UnderstandingData }) {
  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-5">
      <h2 className="text-lg font-semibold text-(--vestara-text) mb-3">Activity</h2>

      {data.activity.currentMilestone && (
        <div className="mb-3 pb-3 border-b border-[var(--color-zinc-800)]">
          <div className="text-xs text-(--vestara-text-muted) uppercase tracking-wide">Current Milestone</div>
          <div className="text-sm font-medium text-(--vestara-text) mt-0.5">{data.activity.currentMilestone}</div>
        </div>
      )}

      {data.activity.recentChanges.length > 0 && (
        <div className="mb-3 pb-3 border-b border-[var(--color-zinc-800)]">
          <div className="text-xs text-(--vestara-text-muted) uppercase tracking-wide mb-1.5">Recent Changes</div>
          <div className="space-y-1">
            {data.activity.recentChanges.slice(0, 5).map((c, i) => (
              <div key={i} className="text-sm text-(--vestara-text-2) truncate">
                <span className="text-(--vestara-text)" title={c.description}>
                  {truncate(c.description, DESC_MAX_LENGTH)}
                </span>
                <span className="text-(--vestara-text-muted) ml-2 text-xs">{c.author}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 text-xs text-(--vestara-text-muted)">
        {data.activity.activeBranches.length > 0 && (
          <span>
            {data.activity.activeBranches.length} active branch{data.activity.activeBranches.length > 1 ? 'es' : ''}
          </span>
        )}
        {data.activity.uncommittedWork && <span className="text-amber-500 font-medium">Uncommitted changes</span>}
      </div>
    </div>
  );
}
