/**
 * GA-UI-006 — Conversation title resolution, temporal grouping, search.
 *
 * Pure presentation helpers over Conversation Runtime metadata. No fetching,
 * no persistence, no authority: titles come from the authoritative
 * `ConversationSummary.title`, with a deterministic bounded fallback to the
 * first human message when the authority holds only the server-assigned
 * counter default (`Conversation N`).
 *
 * Title is presentation metadata, never runtime-session authority. No model
 * is invoked; identity is never derived from OpenCode session titles.
 */

export const TITLE_FALLBACK_LENGTH = 48;

/** Server-assigned counter default, e.g. `Conversation 3`. Not usable for display. */
export function isDefaultTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  return /^Conversation \d+$/.test(title.trim());
}

/** Collapse whitespace and bound to a single short line. Deterministic. */
export function truncateTitle(text: string, maxLength: number = TITLE_FALLBACK_LENGTH): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength).trimEnd()}…`;
}

/**
 * Resolve the display title: authoritative title unless it is the counter
 * default AND a first human message is known — then the bounded fallback.
 * Otherwise the authoritative title is shown as-is (never invented).
 */
export function resolveDisplayTitle(authoritativeTitle: string | undefined | null, firstHumanMessage?: string | null): string {
  if (!isDefaultTitle(authoritativeTitle)) return (authoritativeTitle ?? '').trim() || 'Untitled conversation';
  if (firstHumanMessage && firstHumanMessage.trim()) return truncateTitle(firstHumanMessage);
  if (authoritativeTitle && authoritativeTitle.trim()) return authoritativeTitle.trim();
  return 'Untitled conversation';
}

// ─── Temporal grouping (presentation-only projection) ───────────

export type TemporalGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export const GROUP_ORDER: TemporalGroup[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Group key by calendar-day distance. `now` is injectable for deterministic tests. */
export function groupKeyFor(updatedAt: string, now: number = Date.now()): TemporalGroup {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return 'Older';
  const dayDiff = Math.round((startOfDay(now) - startOfDay(updated)) / 86_400_000);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 7) return 'Previous 7 days';
  return 'Older';
}

export interface GroupedConversations<T> {
  group: TemporalGroup;
  items: T[];
}

/** Group items by `updatedAt`, newest-first within groups; empty groups omitted. */
export function groupConversations<T extends { updatedAt: string }>(items: T[], now: number = Date.now()): GroupedConversations<T>[] {
  const buckets = new Map<TemporalGroup, T[]>();
  for (const item of items) {
    const key = groupKeyFor(item.updatedAt, now);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const byTime = (a: T, b: T) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  return GROUP_ORDER.flatMap((group) => {
    const groupItems = buckets.get(group);
    if (!groupItems || groupItems.length === 0) return [];
    return [{ group, items: [...groupItems].sort(byTime) }];
  });
}

// ─── Local search (title coverage only) ─────────────────────────

/**
 * Substring search over already-resolved display titles. Canonical
 * message-content search does not exist in Conversation Runtime, so no
 * repository-wide indexing is invented here (recorded as adjacent).
 */
export function filterByTitle<T extends { id: string }>(
  items: T[],
  resolveTitle: (id: string) => string,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => resolveTitle(item.id).toLowerCase().includes(q));
}
