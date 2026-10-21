/**
 * U3 — `teal://vestara-shell` link-to-route mapping guards.
 *
 * - Canonical shell routes map 1:1 (static, `:param`, and `/*` splats);
 *   query strings and hashes survive the mapping.
 * - Bare/host-only links land on the default route (`/overview`).
 * - Wrong scheme, wrong host, ports, unknown paths, redirects, public
 *   routes, and non-URLs all map to `null` — never a blind passthrough.
 * - Cold-start (`resolveColdStartRoute`) takes the first valid launch URL.
 * - Running-app (`handleIncomingDeepLinks`) navigates to the first valid
 *   incoming URL and ignores the rest without disturbing the session.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEEP_LINK_DEFAULT_ROUTE,
  DEEP_LINK_HOST,
  DEEP_LINK_SCHEME,
  handleIncomingDeepLinks,
  parseDeepLinkToRoute,
  resolveColdStartRoute,
} from './deep-link.js';

describe('deep-link scheme identity', () => {
  it('pins the teal://vestara-shell scheme', () => {
    expect(DEEP_LINK_SCHEME).toBe('teal');
    expect(DEEP_LINK_HOST).toBe('vestara-shell');
    expect(DEEP_LINK_DEFAULT_ROUTE).toBe('/overview');
  });
});

describe('parseDeepLinkToRoute — canonical shell routes', () => {
  it.each([
    ['teal://vestara-shell/overview', '/overview'],
    ['teal://vestara-shell/chat', '/chat'],
    ['teal://vestara-shell/terminal', '/terminal'],
    ['teal://vestara-shell/sessions', '/sessions'],
    ['teal://vestara-shell/sessions/abc123', '/sessions/abc123'],
    ['teal://vestara-shell/qualification/deepseekV4FlashOpenCodeGo', '/qualification/deepseekV4FlashOpenCodeGo'],
    [
      'teal://vestara-shell/qualification/deepseekV4FlashOpenCodeGo/activity',
      '/qualification/deepseekV4FlashOpenCodeGo/activity',
    ],
    ['teal://vestara-shell/settings/appearance', '/settings/appearance'],
    ['teal://vestara-shell/settings', '/settings'],
    ['teal://vestara-shell/opencode/sessions/xyz', '/opencode/sessions/xyz'],
    ['teal://vestara-shell/intelligence/graph', '/intelligence/graph'],
    ['teal://vestara-shell/marketplace/categories', '/marketplace/categories'],
  ])('maps %s to %s', (link, route) => {
    expect(parseDeepLinkToRoute(link)).toBe(route);
  });

  it('lands bare and root links on the default route', () => {
    expect(parseDeepLinkToRoute('teal://vestara-shell')).toBe('/overview');
    expect(parseDeepLinkToRoute('teal://vestara-shell/')).toBe('/overview');
  });

  it('preserves query strings and hashes', () => {
    expect(parseDeepLinkToRoute('teal://vestara-shell/sessions/abc?tab=events')).toBe('/sessions/abc?tab=events');
    expect(parseDeepLinkToRoute('teal://vestara-shell/chat#thread-1')).toBe('/chat#thread-1');
    expect(parseDeepLinkToRoute('teal://vestara-shell/overview?x=1#y')).toBe('/overview?x=1#y');
  });

  it('tolerates trailing slashes, duplicate slashes, and host case', () => {
    expect(parseDeepLinkToRoute('teal://vestara-shell/chat/')).toBe('/chat');
    expect(parseDeepLinkToRoute('teal://vestara-shell//chat')).toBe('/chat');
    expect(parseDeepLinkToRoute('TEAL://VESTARA-SHELL/chat')).toBe('/chat');
  });

  it('keeps dynamic param case intact', () => {
    expect(parseDeepLinkToRoute('teal://vestara-shell/sessions/ABC123')).toBe('/sessions/ABC123');
  });
});

describe('parseDeepLinkToRoute — rejections', () => {
  it.each([
    'https://vestara-shell/chat',
    'teal2://vestara-shell/chat',
    'teal://other-host/chat',
    'teal://vestara-shell.evil.example/chat',
    'teal://vestara-shell:8080/chat',
    'teal:vestara-shell/chat',
    'teal://vestara-shell/does-not-exist',
    'teal://vestara-shell/sessions/abc/extra-segment',
    'not a url at all',
    '',
  ])('maps %s to null', (link) => {
    expect(parseDeepLinkToRoute(link)).toBeNull();
  });

  it('rejects redirects, public routes, and non-strings', () => {
    // `/dashboard` redirects to `/overview` in-app — deep links use the canonical route.
    expect(parseDeepLinkToRoute('teal://vestara-shell/dashboard')).toBeNull();
    expect(parseDeepLinkToRoute('teal://vestara-shell/login')).toBeNull();
    expect(parseDeepLinkToRoute('teal://vestara-shell/startup')).toBeNull();
    expect(parseDeepLinkToRoute(null)).toBeNull();
    expect(parseDeepLinkToRoute(undefined)).toBeNull();
    expect(parseDeepLinkToRoute(42)).toBeNull();
  });
});

describe('resolveColdStartRoute', () => {
  it('takes the first valid launch URL', async () => {
    await expect(
      resolveColdStartRoute({
        getCurrent: async () => ['teal://vestara-shell/nope', 'teal://vestara-shell/chat'],
      }),
    ).resolves.toBe('/chat');
  });

  it('resolves null when nothing launched the app', async () => {
    await expect(resolveColdStartRoute({ getCurrent: async () => null })).resolves.toBeNull();
    await expect(resolveColdStartRoute({ getCurrent: async () => [] })).resolves.toBeNull();
    await expect(resolveColdStartRoute({ getCurrent: async () => ['teal://vestara-shell/nope'] })).resolves.toBeNull();
  });

  it('never throws when the plugin is unavailable', async () => {
    await expect(
      resolveColdStartRoute({
        getCurrent: async () => {
          throw new Error('denied');
        },
      }),
    ).resolves.toBeNull();
  });
});

describe('handleIncomingDeepLinks', () => {
  it('navigates to the first valid incoming URL', () => {
    const navigate = vi.fn();
    const route = handleIncomingDeepLinks(
      ['https://example.com/x', 'teal://vestara-shell/terminal?session=a', 'teal://vestara-shell/chat'],
      navigate,
    );
    expect(route).toBe('/terminal?session=a');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/terminal?session=a');
  });

  it('leaves the session untouched when nothing matches', () => {
    const navigate = vi.fn();
    expect(handleIncomingDeepLinks(['teal://vestara-shell/nope'], navigate)).toBeNull();
    expect(handleIncomingDeepLinks([], navigate)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
