/**
 * VES-TG-020: Deep links — tests
 */

import { describe, expect, it } from 'vitest';
import {
  buildDeepLink,
  buildDeepLinkPayload,
  isDeepLinkValid,
  parseDeepLink,
  signDeepLinkPayload,
  verifyDeepLink,
} from '../src/deep-links';

const SECRET = 'test-secret';
const BASE = 'https://vestara.local';

describe('buildDeepLink', () => {
  it('produces a signed link with parameters and expiry', () => {
    const url = buildDeepLink({
      action: 'execution',
      params: { id: 'exec-1', workspace: 'ws-1' },
      baseUrl: BASE,
      secret: SECRET,
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/telegram/execution');
    expect(parsed.searchParams.get('id')).toBe('exec-1');
    expect(parsed.searchParams.get('sig')).toBeTruthy();
    expect(parsed.searchParams.get('exp')).toBe('2026-12-31T00:00:00.000Z');
  });

  it('throws when no secret is supplied', () => {
    expect(() => buildDeepLink({ action: 'settings', baseUrl: BASE, secret: '' })).toThrow();
  });
});

describe('payload canonicalization', () => {
  it('is order-independent', () => {
    const a = buildDeepLinkPayload('execution', { b: '2', a: '1' }, 'exp');
    const b = buildDeepLinkPayload('execution', { a: '1', b: '2' }, 'exp');
    expect(a).toBe(b);
  });

  it('signs deterministically', () => {
    const payload = buildDeepLinkPayload('execution', { a: '1' }, null);
    expect(signDeepLinkPayload(payload, SECRET)).toBe(signDeepLinkPayload(payload, SECRET));
  });
});

describe('verifyDeepLink', () => {
  it('accepts a freshly built unexpired link', () => {
    const url = buildDeepLink({
      action: 'conversation',
      params: { id: 'conv-1' },
      baseUrl: BASE,
      secret: SECRET,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(verifyDeepLink(url, SECRET).status).toBe('valid');
    expect(isDeepLinkValid(url, SECRET)).toBe(true);
  });

  it('detects a tampered parameter', () => {
    const url = buildDeepLink({
      action: 'workspace',
      params: { id: 'ws-1' },
      baseUrl: BASE,
      secret: SECRET,
    });
    const tampered = url.replace('ws-1', 'ws-2');
    expect(verifyDeepLink(tampered, SECRET).status).toBe('tampered');
    expect(isDeepLinkValid(tampered, SECRET)).toBe(false);
  });

  it('rejects a link signed with another secret', () => {
    const url = buildDeepLink({ action: 'settings', baseUrl: BASE, secret: 'other' });
    expect(verifyDeepLink(url, SECRET).status).toBe('tampered');
  });

  it('rejects an expired link', () => {
    const url = buildDeepLink({
      action: 'approval',
      baseUrl: BASE,
      secret: SECRET,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    expect(verifyDeepLink(url, SECRET).status).toBe('expired');
  });

  it('rejects a missing signature', () => {
    const url = buildDeepLink({ action: 'settings', baseUrl: BASE, secret: SECRET });
    const parsed = new URL(url);
    parsed.searchParams.delete('sig');
    expect(verifyDeepLink(parsed.toString(), SECRET).status).toBe('missing-signature');
  });

  it('reports unknown actions instead of accepting them', () => {
    const url = buildDeepLink({ action: 'settings', baseUrl: BASE, secret: SECRET });
    const foreign = url.replace('/telegram/settings', '/telegram/admin');
    expect(verifyDeepLink(foreign, SECRET).status).toBe('unknown-action');
  });

  it('parses malformed URLs without throwing', () => {
    const parsed = parseDeepLink('not a url');
    expect(parsed.action).toBeNull();
    expect(parsed.payload).toBeNull();
  });
});
