/**
 * VES-OVERVIEW-001: Shared relative-time formatter.
 *
 * Single canonical `timeAgo` for the Overview surface so
 * Continue Working and Recent Activity agree on compact output
 * ("5m ago", "2h ago", "3d ago").
 */

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatClockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return iso;
  }
}
