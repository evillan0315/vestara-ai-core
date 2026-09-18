/**
 * VES-TG-020: Telegram Deep Links
 *
 * Builds and verifies signed deep links that point from a Telegram message
 * back into the correct Vestara surface. Every link carries an HMAC-SHA256
 * signature over its action, canonical parameters, and expiry, so a link
 * cannot be edited to point at another workspace, conversation, or approval
 * (tampered deep link — see the TG-025 security matrix).
 *
 * Links are presentation-layer only: opening one still requires an
 * authenticated Vestara session. A valid signature is a routing hint, never
 * an authority grant.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-020)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────

export type DeepLinkAction = 'workspace' | 'conversation' | 'execution' | 'approval' | 'settings';

export const DEEP_LINK_ACTIONS: readonly DeepLinkAction[] = [
  'workspace',
  'conversation',
  'execution',
  'approval',
  'settings',
];

export interface DeepLinkInput {
  /** Target surface */
  readonly action: DeepLinkAction;

  /** Action parameters (encoded into the signed payload) */
  readonly params?: Readonly<Record<string, string>>;

  /** Vestara base URL (e.g. https://vestara.local) */
  readonly baseUrl: string;

  /** Signing secret */
  readonly secret: string;

  /** Absolute expiry (ISO-8601). Callers should always set this. */
  readonly expiresAt?: string;
}

export interface ParsedDeepLink {
  /** Target surface, when recognized */
  readonly action: DeepLinkAction | null;

  /** Decoded parameters */
  readonly params: Readonly<Record<string, string>>;

  /** Signature presented by the link */
  readonly signature: string | null;

  /** Expiry presented by the link */
  readonly expiresAt: string | null;

  /** Raw payload string that was signed */
  readonly payload: string | null;
}

export type DeepLinkStatus =
  | 'valid'
  | 'invalid-format'
  | 'unknown-action'
  | 'missing-signature'
  | 'tampered'
  | 'expired';

export interface DeepLinkVerification {
  /** Verification outcome */
  readonly status: DeepLinkStatus;

  /** Whether the link may be followed */
  readonly valid: boolean;

  /** Parsed link (always present for audit) */
  readonly link: ParsedDeepLink;
}

// ─── Payload Canonicalization ──────────────────────────────────

/**
 * Canonical signed payload. Parameter keys are sorted so signature
 * verification is order-independent and deterministic.
 */
export function buildDeepLinkPayload(
  action: string,
  params: Readonly<Record<string, string>>,
  expiresAt: string | null,
): string {
  const pairs = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return `${action}\n${pairs}\n${expiresAt ?? ''}`;
}

/**
 * Compute the base64url signature for a payload.
 */
export function signDeepLinkPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ─── Build ─────────────────────────────────────────────────────

/**
 * Build a signed deep link. Throws when the secret is empty — an unsigned
 * link must never be produced by accident.
 */
export function buildDeepLink(input: DeepLinkInput): string {
  if (!input.secret) throw new Error('Deep-link secret is required');
  const params = input.params ?? {};
  const expiresAt = input.expiresAt ?? null;
  const payload = buildDeepLinkPayload(input.action, params, expiresAt);
  const signature = signDeepLinkPayload(payload, input.secret);

  const query = new URLSearchParams({ ...params });
  if (expiresAt) query.set('exp', expiresAt);
  query.set('sig', signature);

  const base = input.baseUrl.replace(/\/+$/, '');
  return `${base}/telegram/${input.action}?${query.toString()}`;
}

// ─── Parse ─────────────────────────────────────────────────────

function isAction(value: string | null): value is DeepLinkAction {
  return value !== null && (DEEP_LINK_ACTIONS as readonly string[]).includes(value);
}

/**
 * Parse a deep link without verifying it. Always returns a shape so callers
 * can audit rejected links; never throws on malformed input.
 */
export function parseDeepLink(url: string): ParsedDeepLink {
  const empty: ParsedDeepLink = {
    action: null,
    params: {},
    signature: null,
    expiresAt: null,
    payload: null,
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return empty;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const actionSegment = segments[segments.length - 1] ?? null;
  const action = isAction(actionSegment) ? actionSegment : null;

  const params: Record<string, string> = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    if (key === 'sig' || key === 'exp') continue;
    params[key] = value;
  }
  const signature = parsed.searchParams.get('sig');
  const expiresAt = parsed.searchParams.get('exp');

  return {
    action,
    params,
    signature,
    expiresAt,
    payload: action ? buildDeepLinkPayload(action, params, expiresAt) : null,
  };
}

// ─── Verify ────────────────────────────────────────────────────

/**
 * Verify a deep link's signature and expiry.
 *
 * Verification order is fixed: missing signature, unknown action, tamper,
 * then expiry. A tampered link is never reported as merely expired.
 */
export function verifyDeepLink(url: string, secret: string, now: Date = new Date()): DeepLinkVerification {
  const link = parseDeepLink(url);

  if (!link.action || !link.payload) {
    return {
      status: 'unknown-action',
      valid: false,
      link,
    };
  }
  if (!link.signature) {
    return { status: 'missing-signature', valid: false, link };
  }

  const expected = signDeepLinkPayload(link.payload, secret);
  if (!constantTimeEqual(link.signature, expected)) {
    return { status: 'tampered', valid: false, link };
  }

  if (link.expiresAt) {
    const expiry = Date.parse(link.expiresAt);
    if (Number.isNaN(expiry)) {
      return { status: 'invalid-format', valid: false, link };
    }
    if (expiry <= now.getTime()) {
      return { status: 'expired', valid: false, link };
    }
  }

  return { status: 'valid', valid: true, link };
}

/**
 * Convenience predicate used by call sites that only need a boolean.
 */
export function isDeepLinkValid(url: string, secret: string, now: Date = new Date()): boolean {
  return verifyDeepLink(url, secret, now).valid;
}
