/**
 * GA-RETRY-001: usage-limit retry-at parsing for Global Assistant.
 *
 * Parses provider "try again at ..." timestamps (e.g. Codex usage-limit
 * errors) into an ISO instant the scheduler can persist. Pure functions —
 * no fetch, no DOM, no Conversation authority.
 */

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const USAGE_LIMIT_RE =
  /usage.?limit|rate.?limit|too many requests|quota.?exceeded|out of credits|purchase more credits|try again|429/i;

/** True when the error text looks like a provider usage-limit/rate-limit failure. */
export function isUsageLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  return USAGE_LIMIT_RE.test(message);
}

/**
 * Parse a retry-at instant from free-form provider error text.
 * Handles:
 * - "Sep 26th, 2026 7:51 AM" (ordinal + optional year/comma)
 * - ISO 8601 ("2026-09-26T07:51:00Z")
 * - Relative "in 30m / in 2 hours / in 45 seconds"
 * Returns null when no future instant can be resolved.
 */
export function parseRetryAt(message: string, now: Date = new Date()): Date | null {
  if (!message) return null;

  const iso = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/);
  if (iso) {
    const d = new Date(iso[0]);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) return d;
  }

  const rel = message.match(/in\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i);
  if (rel) {
    const amount = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const ms =
      unit.startsWith('s') ? amount * 1000
      : unit.startsWith('m') && !unit.startsWith('min') && unit.length === 1 ? amount * 60_000
      : unit.startsWith('min') ? amount * 60_000
      : unit.startsWith('h') ? amount * 3_600_000
      : amount * 86_400_000;
    if (unit.startsWith('m') && unit !== 'm' && !unit.startsWith('min') && !unit.startsWith('month')) {
      // "minutes" handled above; fall through for month-ish words (unsupported)
    }
    const d = new Date(now.getTime() + ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const abs = message.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?:\s*:\s*(\d{2}))?\s*(AM|PM)?\b/i,
  );
  if (abs) {
    const month = MONTHS[abs[1].toLowerCase()];
    if (month === undefined) return null;
    const day = Number(abs[2]);
    const year = abs[3] ? Number(abs[3]) : now.getFullYear();
    let hour = Number(abs[4]);
    const minute = Number(abs[5]);
    const second = abs[6] ? Number(abs[6]) : 0;
    const meridiem = abs[7]?.toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    let d = new Date(year, month, day, hour, minute, second);
    if (Number.isNaN(d.getTime())) return null;
    // No year given and the date already passed → assume next year.
    if (!abs[3] && d.getTime() <= now.getTime()) {
      d = new Date(year + 1, month, day, hour, minute, second);
    }
    if (d.getTime() <= now.getTime()) return null;
    return d;
  }

  return null;
}

/** Display label for a retry instant (local time, e.g. "Sep 26, 7:51 AM"). */
export function formatRetryLabel(date: Date): string {
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export interface UsageLimitRetry {
  retryAtISO: string;
  label: string;
}

/** Combined classifier: usage-limit error + resolvable future retry instant. */
export function getUsageLimitRetry(
  error: string | null | undefined,
  now: Date = new Date(),
): UsageLimitRetry | null {
  if (!isUsageLimitError(error ?? '')) return null;
  const at = parseRetryAt(error ?? '', now);
  if (!at) return null;
  return { retryAtISO: at.toISOString(), label: formatRetryLabel(at) };
}
