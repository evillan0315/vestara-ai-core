import { describe, expect, it } from 'vitest';
import {
  computeGitHubSignature,
  DeliveryDeduplicator,
  GITHUB_DELIVERY_HEADER,
  GITHUB_EVENT_HEADER,
  GITHUB_SIGNATURE_HEADER,
  validateWebhookIngress,
  verifyGitHubSignature,
} from '../src/webhook';

const SECRET = 'shhh-test-secret';
const body = JSON.stringify({ action: 'completed', workflow_run: { id: 1 } });

function headers(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [GITHUB_EVENT_HEADER]: 'workflow_run',
    [GITHUB_DELIVERY_HEADER]: 'delivery-1',
    [GITHUB_SIGNATURE_HEADER]: computeGitHubSignature(SECRET, body),
    ...over,
  };
}

describe('GitHub signature verification', () => {
  it('accepts a matching sha256 signature', () => {
    expect(verifyGitHubSignature(SECRET, body, computeGitHubSignature(SECRET, body))).toBe(true);
  });

  it('rejects wrong secret, missing header, and malformed length', () => {
    expect(verifyGitHubSignature(SECRET, body, computeGitHubSignature('other', body))).toBe(false);
    expect(verifyGitHubSignature(SECRET, body, undefined)).toBe(false);
    expect(verifyGitHubSignature(SECRET, body, 'sha256=deadbeef')).toBe(false);
    expect(verifyGitHubSignature('', body, computeGitHubSignature(SECRET, body))).toBe(false);
  });
});

describe('webhook ingress validation', () => {
  it('accepts a trusted workflow_run completion and records the delivery', () => {
    const dedupe = new DeliveryDeduplicator();
    const decision = validateWebhookIngress({ secret: SECRET, rawBody: body, headers: headers(), dedupe });
    expect(decision).toEqual({ accepted: true, kind: 'completion' });
    expect(dedupe.size).toBe(1);
  });

  it('rejects a replayed delivery', () => {
    const dedupe = new DeliveryDeduplicator();
    validateWebhookIngress({ secret: SECRET, rawBody: body, headers: headers(), dedupe });
    const replay = validateWebhookIngress({ secret: SECRET, rawBody: body, headers: headers(), dedupe });
    expect(replay).toEqual({ accepted: false, reason: 'duplicate-delivery' });
  });

  it('rejects untrusted ingress before inspecting the body', () => {
    const dedupe = new DeliveryDeduplicator();
    const bad = validateWebhookIngress({
      secret: SECRET,
      rawBody: body,
      headers: headers({ [GITHUB_SIGNATURE_HEADER]: 'sha256=00' }),
      dedupe,
    });
    expect(bad).toEqual({ accepted: false, reason: 'invalid-signature' });
    expect(dedupe.size).toBe(0);
  });

  it('rejects non-workflow_run events and unsupported actions', () => {
    const dedupe = new DeliveryDeduplicator();
    expect(
      validateWebhookIngress({
        secret: SECRET,
        rawBody: body,
        headers: headers({ [GITHUB_EVENT_HEADER]: 'ping' }),
        dedupe,
      }),
    ).toEqual({ accepted: false, reason: 'unsupported-event:ping' });

    const requested = JSON.stringify({ action: 'requested' });
    expect(
      validateWebhookIngress({
        secret: SECRET,
        rawBody: requested,
        headers: headers({ [GITHUB_SIGNATURE_HEADER]: computeGitHubSignature(SECRET, requested) }),
        dedupe,
      }),
    ).toEqual({ accepted: true, kind: 'progress' });
  });

  it('rejects missing delivery id and malformed bodies', () => {
    const dedupe = new DeliveryDeduplicator();
    expect(
      validateWebhookIngress({
        secret: SECRET,
        rawBody: body,
        headers: headers({ [GITHUB_DELIVERY_HEADER]: undefined }),
        dedupe,
      }),
    ).toEqual({ accepted: false, reason: 'missing-delivery-id' });

    const malformed = '{not json';
    expect(
      validateWebhookIngress({
        secret: SECRET,
        rawBody: malformed,
        headers: headers({ [GITHUB_SIGNATURE_HEADER]: computeGitHubSignature(SECRET, malformed) }),
        dedupe,
      }),
    ).toEqual({ accepted: false, reason: 'malformed-body' });
  });
});
