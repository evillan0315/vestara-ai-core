/**
 * CI-OBS-002A — GitHub webhook ingress boundary.
 *
 * Verifies the GitHub HMAC signature, deduplicates deliveries, and classifies
 * trusted ingress. Provider-native payloads never pass this boundary into
 * workflow authority: the caller normalizes them through
 * `@vestara/github-ci-adapter` before any adjudication.
 *
 * Invariants:
 *   - Untrusted ingress is rejected, never partially processed.
 *   - Replayed deliveries are inert (deduplicated).
 *   - Ingress acceptance is not CI success and confers no authority.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const GITHUB_SIGNATURE_HEADER = 'x-hub-signature-256';
export const GITHUB_EVENT_HEADER = 'x-github-event';
export const GITHUB_DELIVERY_HEADER = 'x-github-delivery';

export type WebhookHeaders = Readonly<Record<string, string | undefined>>;

/** Case-insensitive header lookup. Pure. */
export function readHeader(headers: WebhookHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

/** Compute the canonical `sha256=<hex>` signature for a raw body. Pure. */
export function computeGitHubSignature(secret: string, rawBody: string): string {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

/** Constant-time signature verification. Pure. */
export function verifyGitHubSignature(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
  if (!secret) return false;
  if (!signatureHeader) return false;
  const expected = computeGitHubSignature(secret, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** What an accepted delivery represents. */
export type WebhookIngressKind = 'completion' | 'progress';

export interface WebhookIngressDecision {
  readonly accepted: boolean;
  readonly kind?: WebhookIngressKind;
  /** Present when rejected. */
  readonly reason?: string;
}

const WORKFLOW_RUN_ACTIONS: Readonly<Record<string, WebhookIngressKind>> = {
  completed: 'completion',
  requested: 'progress',
  in_progress: 'progress',
};

/** Bounded delivery deduplicator (delivery id → seen). */
export class DeliveryDeduplicator {
  private readonly seenIds = new Set<string>();

  /** Returns true when this delivery was already processed. */
  has(deliveryId: string): boolean {
    return this.seenIds.has(deliveryId);
  }

  /** Records a delivery. Returns false when it was already recorded. */
  record(deliveryId: string): boolean {
    if (this.seenIds.has(deliveryId)) return false;
    this.seenIds.add(deliveryId);
    return true;
  }

  get size(): number {
    return this.seenIds.size;
  }
}

export interface ValidateIngressInput {
  readonly secret: string;
  readonly rawBody: string;
  readonly headers: WebhookHeaders;
  readonly dedupe: DeliveryDeduplicator;
}

/**
 * Validate a GitHub delivery.
 *
 * Order matters: signature first (untrusted bodies are never inspected),
 * then event/action classification, then delivery dedupe.
 */
export function validateWebhookIngress(input: ValidateIngressInput): WebhookIngressDecision {
  const signature = readHeader(input.headers, GITHUB_SIGNATURE_HEADER);
  if (!verifyGitHubSignature(input.secret, input.rawBody, signature)) {
    return { accepted: false, reason: 'invalid-signature' };
  }

  const event = readHeader(input.headers, GITHUB_EVENT_HEADER);
  if (event !== 'workflow_run') {
    return { accepted: false, reason: `unsupported-event:${event ?? 'missing'}` };
  }

  const deliveryId = readHeader(input.headers, GITHUB_DELIVERY_HEADER);
  if (!deliveryId) {
    return { accepted: false, reason: 'missing-delivery-id' };
  }

  let action: unknown;
  try {
    action = (JSON.parse(input.rawBody) as { action?: unknown }).action;
  } catch {
    return { accepted: false, reason: 'malformed-body' };
  }
  if (typeof action !== 'string' || !(action in WORKFLOW_RUN_ACTIONS)) {
    return { accepted: false, reason: `unsupported-action:${String(action)}` };
  }

  // Dedupe only after the delivery is proven trusted and classifiable.
  if (!input.dedupe.record(deliveryId)) {
    return { accepted: false, reason: 'duplicate-delivery' };
  }

  return { accepted: true, kind: WORKFLOW_RUN_ACTIONS[action] };
}
