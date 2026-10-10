/**
 * Activity Room Skeleton — dynamic loading placeholder shared by every
 * Activity Room surface (rail, stream, workflow browser, dialogs).
 *
 * Workflow-page parity: staged entrance + gentle pulse + shimmer sweep
 * (see .ar-skeleton in activity-room.css, same recipe as .mpg-skeleton),
 * varied row heights that mimic real content, role="status" with a
 * screen-reader announcement. No hardcoded visuals — every value flows
 * through var(--vestara-*) tokens in CSS.
 */

const ROW_HEIGHTS = ['ar-skeleton--lg', 'ar-skeleton--md', 'ar-skeleton--sm', 'ar-skeleton--md', 'ar-skeleton--sm'] as const;

export type ActivitySkeletonVariant = 'participants' | 'workflows' | 'stream' | 'metrics' | 'compact';

interface ActivityRoomSkeletonProps {
  /** Kicker label shown above the rows (e.g. "Participants"). */
  readonly label: string;
  /** Full accessible label for the status region. Defaults to `Loading ${label}`. */
  readonly statusLabel?: string;
  /** Layout variant — each mimics the surface it stands in for. */
  readonly variant?: ActivitySkeletonVariant;
  /** Row count override (defaults per variant). */
  readonly count?: number;
}

function rowsForVariant(variant: ActivitySkeletonVariant, count?: number): number {
  if (count !== undefined) return count;
  switch (variant) {
    case 'participants':
      return 4;
    case 'workflows':
      return 3;
    case 'stream':
      return 5;
    case 'metrics':
      return 3;
    case 'compact':
      return 2;
  }
}

export default function ActivityRoomSkeleton({
  label,
  statusLabel,
  variant = 'stream',
  count,
}: ActivityRoomSkeletonProps) {
  const rows = rowsForVariant(variant, count);
  const regionLabel = statusLabel ?? `Loading ${label}`;
  const indices = Array.from({ length: rows }, (_, i) => i);

  if (variant === 'participants') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2" role="status" aria-live="polite" aria-label={regionLabel}>
        <span className="ar-kicker">{label}</span>
        {indices.map((i) => (
          <div key={i} aria-hidden="true" className="ar-skeleton-row" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="ar-skeleton-row__avatar" />
            <span className="ar-skeleton-row__lines">
              <span className="ar-skeleton-row__line" style={{ width: `${72 - (i % 3) * 12}%` }} />
              <span className="ar-skeleton-row__line" style={{ width: `${48 - (i % 2) * 8}%` }} />
            </span>
          </div>
        ))}
        <p className="sr-only">{regionLabel}…</p>
      </div>
    );
  }

  if (variant === 'metrics') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2" role="status" aria-live="polite" aria-label={regionLabel}>
        <span className="ar-kicker">{label}</span>
        {indices.map((i) => (
          <div key={i} aria-hidden="true" className="ar-skeleton ar-skeleton--xs" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
        <p className="sr-only">{regionLabel}…</p>
      </div>
    );
  }

  const heights =
    variant === 'compact'
      ? ['ar-skeleton--sm', 'ar-skeleton--xs']
      : variant === 'workflows'
        ? ['ar-skeleton--md', 'ar-skeleton--lg', 'ar-skeleton--sm']
        : ROW_HEIGHTS;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 py-1" role="status" aria-live="polite" aria-label={regionLabel}>
      <span className="ar-kicker">{label}</span>
      {indices.map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`ar-skeleton ${heights[i % heights.length]}`}
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
      <p className="sr-only">{regionLabel}…</p>
    </div>
  );
}
