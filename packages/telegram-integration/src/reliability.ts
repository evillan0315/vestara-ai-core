/**
 * VES-TG-022: Telegram Reliability
 *
 * Delivery reliability primitives: failure classification, retry timing,
 * a token-bucket rate limiter, and message coalescing. Together they keep a
 * long-running execution from flooding a chat and make Telegram's retry
 * semantics explicit rather than accidental.
 *
 * No timers are used — retry timing is returned as data so behavior stays
 * deterministic in tests and safe across restarts.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-022)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import type { ChannelDelivery } from '@vestara/channel-types';

// ─── Failure Classification ────────────────────────────────────

export type DeliveryFailureKind = 'rate_limited' | 'server_error' | 'client_error' | 'network' | 'timeout' | 'unknown';

export interface DeliveryFailure {
  /** Classification */
  readonly kind: DeliveryFailureKind;

  /** Whether a retry could succeed */
  readonly retryable: boolean;

  /** Human-readable detail */
  readonly message: string;

  /** Server-requested retry delay in ms (e.g. Telegram 429 retry_after) */
  readonly retryAfterMs?: number;
}

/**
 * Classify a Telegram Bot API failure. Accepts either an `Error` or a parsed
 * Bot API response body (`{ ok: false, error_code, description, parameters }`).
 */
export function classifyDeliveryError(error: unknown): DeliveryFailure {
  const body = asRecord(error);

  if (body) {
    const status = numberField(body, 'error_code');
    const description = stringField(body, 'description') ?? 'Telegram API error';
    const retryAfterSeconds = numberField(asRecord(body.parameters), 'retry_after');

    if (status === 429) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message: description,
        retryAfterMs: retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined,
      };
    }
    if (status !== undefined && status >= 500) {
      return { kind: 'server_error', retryable: true, message: description };
    }
    if (status !== undefined && status >= 400) {
      return { kind: 'client_error', retryable: false, message: description };
    }
  }

  if (error instanceof Error) {
    const message = error.message;
    const name = error.name;
    if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out/i.test(message)) {
      return { kind: 'timeout', retryable: true, message };
    }
    if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message)) {
      return { kind: 'network', retryable: true, message };
    }
    if (/fetch failed|network/i.test(message)) {
      return { kind: 'network', retryable: true, message };
    }
    return { kind: 'unknown', retryable: true, message };
  }

  return { kind: 'unknown', retryable: true, message: 'Unknown delivery failure' };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | undefined {
  if (!record) return undefined;
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Compute the bounded exponential backoff for an attempt, honouring a
 * server-requested `retryAfterMs` as a floor.
 */
export function computeRetryDelayMs(
  attempt: number,
  options?: { baseDelayMs?: number; maxDelayMs?: number; retryAfterMs?: number },
): number {
  const base = options?.baseDelayMs ?? 1000;
  const max = options?.maxDelayMs ?? 60_000;
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const backoff = Math.min(base * 2 ** (safeAttempt - 1), max);
  const serverFloor = options?.retryAfterMs ?? 0;
  return Math.min(Math.max(backoff, serverFloor), max);
}

// ─── Rate Limiting ─────────────────────────────────────────────

export interface RateLimitDecision {
  /** Whether the request may proceed */
  readonly allowed: boolean;

  /** Milliseconds until the next token is available (0 when allowed) */
  readonly retryAfterMs: number;
}

/**
 * Deterministic token-bucket rate limiter. `now` is injected so tests do not
 * depend on wall-clock time.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefillMs = now;
  }

  /** Attempt to consume a token. */
  tryConsume(now: number = Date.now()): RateLimitDecision {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    const missing = 1 - this.tokens;
    const retryAfterMs = Math.ceil((missing / this.refillPerSecond) * 1000);
    return { allowed: false, retryAfterMs };
  }

  private refill(now: number): void {
    const elapsedSeconds = (now - this.lastRefillMs) / 1000;
    if (elapsedSeconds <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefillMs = now;
  }
}

// ─── Message Coalescing ────────────────────────────────────────

/**
 * Coalesces progressive updates for the same logical surface into a single
 * Telegram message. The first delivery sends a new message; subsequent
 * deliveries for the same key are rewritten to edit that message in place.
 *
 * The mapping is keyed by the caller (e.g. `execution:<id>`), never inferred,
 * so two executions can never edit each other's cards.
 */
export class TelegramDeliveryCoalescer {
  private readonly messages: Map<string, string> = new Map();

  /**
   * Record the external message ID produced for a coalescing key. Call after
   * a successful send so later updates can edit it.
   */
  register(key: string, externalMessageId: string): void {
    this.messages.set(key, externalMessageId);
  }

  /** Get the external message ID currently bound to a key. */
  resolve(key: string): string | undefined {
    return this.messages.get(key);
  }

  /** Forget a key, e.g. once an execution reaches a terminal state. */
  clear(key: string): void {
    this.messages.delete(key);
  }

  /**
   * Rewrite a delivery so it edits the coalesced message when one exists,
   * otherwise create the binding by returning the delivery unchanged.
   */
  coalesce(delivery: ChannelDelivery, key: string): ChannelDelivery {
    const existing = this.messages.get(key);
    if (!existing) return delivery;
    return { ...delivery, editMessageId: existing };
  }

  get size(): number {
    return this.messages.size;
  }
}
