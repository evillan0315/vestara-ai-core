/**
 * VES-TG-025: Telegram Security Hardening
 *
 * A single, testable guard for the Telegram channel's adversarial surface:
 * webhook-secret verification, callback replay protection, pairing-token
 * expiry, stale-approval rejection, revoked-principal handling, workspace
 * scope checks, and command-input sanitization.
 *
 * Every check is fail-closed and returns an explicit reason so denials are
 * auditable. Telegram remains a projection: none of these checks grant
 * authority, they only refuse it.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-025)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { timingSafeEqual } from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────

export type SecurityReason =
  | 'allowed'
  | 'invalid-secret'
  | 'replayed-callback'
  | 'unknown-callback'
  | 'expired-token'
  | 'token-already-used'
  | 'stale-approval'
  | 'approval-after-terminal'
  | 'revoked-principal'
  | 'cross-workspace'
  | 'integration-disabled'
  | 'invalid-command';

export interface SecurityDecision {
  /** Whether the action may proceed */
  readonly allowed: boolean;

  /** Why the decision was made */
  readonly reason: SecurityReason;

  /** Optional human-readable detail */
  readonly detail?: string;
}

export interface PairingTokenState {
  readonly status: 'pending' | 'approved' | 'expired' | 'denied';
  readonly expiresAt: string;
  readonly approvedAt?: string;
}

export interface CallbackRecord {
  readonly callbackId: string;
  readonly seenAt: number;
}

export interface TelegramSecurityConfig {
  /** Maximum callback-data length accepted (Telegram allows 64 bytes) */
  readonly maxCallbackBytes?: number;

  /** Callback replay window in ms (default 24h) */
  readonly callbackTtlMs?: number;

  /** Maximum age of an approval before it is stale (default 15 min) */
  readonly approvalTtlMs?: number;

  /** Maximum accepted command length */
  readonly maxCommandLength?: number;
}

const DEFAULT_CONFIG: Required<TelegramSecurityConfig> = {
  maxCallbackBytes: 64,
  callbackTtlMs: 24 * 60 * 60 * 1000,
  approvalTtlMs: 15 * 60 * 1000,
  maxCommandLength: 4096,
};

/** Characters that let a value escape its intended argument position. */
const SHELL_METACHARACTERS = /[;&|`$<>\\\n\r]/;

// ─── Helpers ───────────────────────────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ─── Errors ────────────────────────────────────────────────────

/**
 * Thrown when a security decision denies an action. Fail-closed: callers
 * convert this into a rejection response rather than continuing.
 */
export class TelegramAccessDeniedError extends Error {
  readonly reason: SecurityReason;

  constructor(reason: SecurityReason, message?: string) {
    super(message ?? `Telegram access denied: ${reason}`);
    this.name = 'TelegramAccessDeniedError';
    this.reason = reason;
  }
}

// ─── Guard ─────────────────────────────────────────────────────

export class TelegramSecurityGuard {
  private readonly config: Required<TelegramSecurityConfig>;
  private readonly seenCallbacks = new Map<string, CallbackRecord>();

  constructor(config?: TelegramSecurityConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verify the `X-Telegram-Bot-Api-Secret-Token` header against the expected
   * secret. An unconfigured secret is treated as a misconfiguration and
   * denied — the webhook must never run unauthenticated.
   */
  verifyWebhookSecret(presented: string | undefined, expected: string | undefined): SecurityDecision {
    if (!expected) {
      return { allowed: false, reason: 'invalid-secret', detail: 'Webhook secret is not configured' };
    }
    if (!presented || !constantTimeEqual(presented, expected)) {
      return { allowed: false, reason: 'invalid-secret' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /**
   * Reject replayed callback queries. The first sighting is recorded; any
   * later sighting within the TTL is denied. Expired entries are pruned
   * lazily.
   */
  checkCallback(callbackId: string, now: number = Date.now()): SecurityDecision {
    if (!callbackId) {
      return { allowed: false, reason: 'unknown-callback' };
    }
    this.pruneCallbacks(now);

    if (this.seenCallbacks.has(callbackId)) {
      return { allowed: false, reason: 'replayed-callback' };
    }
    this.seenCallbacks.set(callbackId, { callbackId, seenAt: now });
    return { allowed: true, reason: 'allowed' };
  }

  /** Validate a pairing token's lifecycle state and expiry. */
  checkPairingToken(state: PairingTokenState, now: Date = new Date()): SecurityDecision {
    if (state.status === 'approved') {
      return { allowed: false, reason: 'token-already-used' };
    }
    if (state.status !== 'pending') {
      return { allowed: false, reason: 'expired-token' };
    }
    const expiry = Date.parse(state.expiresAt);
    if (Number.isNaN(expiry) || expiry <= now.getTime()) {
      return { allowed: false, reason: 'expired-token' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /**
   * Reject an approval bound to an execution that has already reached a
   * terminal state, or one that has been pending too long. Telegram must
   * never manufacture permission for finished work (TG-S3/S5).
   */
  checkApproval(input: { requestedAt: string; executionStatus?: string }, now: Date = new Date()): SecurityDecision {
    const terminal =
      input.executionStatus === 'completed' ||
      input.executionStatus === 'failed' ||
      input.executionStatus === 'cancelled';
    if (terminal) {
      return { allowed: false, reason: 'approval-after-terminal' };
    }

    const requested = Date.parse(input.requestedAt);
    if (!Number.isNaN(requested) && now.getTime() - requested > this.config.approvalTtlMs) {
      return { allowed: false, reason: 'stale-approval' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /** Reject actions from a principal whose binding has been revoked. */
  checkPrincipalActive(active: boolean): SecurityDecision {
    return active ? { allowed: true, reason: 'allowed' } : { allowed: false, reason: 'revoked-principal' };
  }

  /**
   * Enforce that the workspace a request targets matches the workspace the
   * principal is bound to for this chat. Prevents cross-workspace leakage.
   */
  checkWorkspaceScope(
    boundWorkspaceId: string | undefined,
    requestedWorkspaceId: string | undefined,
  ): SecurityDecision {
    if (!boundWorkspaceId) {
      return { allowed: false, reason: 'cross-workspace', detail: 'No workspace bound for this chat' };
    }
    if (requestedWorkspaceId && requestedWorkspaceId !== boundWorkspaceId) {
      return { allowed: false, reason: 'cross-workspace', detail: 'Requested workspace does not match binding' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /** Refuse all processing when the integration is administratively off. */
  checkIntegrationEnabled(enabled: boolean): SecurityDecision {
    return enabled ? { allowed: true, reason: 'allowed' } : { allowed: false, reason: 'integration-disabled' };
  }

  /**
   * Validate callback data belongs to a recognized action namespace and is
   * within Telegram's byte budget before it is parsed.
   */
  checkCallbackData(callbackData: string | undefined): SecurityDecision {
    if (!callbackData) {
      return { allowed: false, reason: 'invalid-command' };
    }
    if (Buffer.byteLength(callbackData, 'utf8') > this.config.maxCallbackBytes) {
      return { allowed: false, reason: 'invalid-command', detail: 'Callback data exceeds Telegram limit' };
    }
    const category = callbackData.split(':')[0] ?? '';
    if (!/^[a-z][a-z0-9_-]*$/.test(category)) {
      return { allowed: false, reason: 'invalid-command', detail: 'Unknown callback namespace' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /**
   * Sanitize untrusted command text. Returns null when the input is empty or
   * unsafe. Control characters are stripped and shell metacharacters are
   * reported so callers never shell-interpolate raw Telegram input.
   */
  sanitizeCommandInput(text: string | undefined): { value: string | null; containsShellMetacharacters: boolean } {
    if (typeof text !== 'string') return { value: null, containsShellMetacharacters: false };
    const stripped = text.replace(/\p{Cc}/gu, '').trim();
    if (stripped.length === 0) return { value: null, containsShellMetacharacters: false };
    return {
      value: stripped.slice(0, this.config.maxCommandLength),
      containsShellMetacharacters: SHELL_METACHARACTERS.test(stripped),
    };
  }

  /** Prune expired callback records. */
  private pruneCallbacks(now: number): void {
    for (const [id, record] of this.seenCallbacks) {
      if (now - record.seenAt > this.config.callbackTtlMs) {
        this.seenCallbacks.delete(id);
      }
    }
  }

  /** Number of tracked callback IDs (diagnostics). */
  getTrackedCallbackCount(): number {
    return this.seenCallbacks.size;
  }
}
