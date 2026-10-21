/**
 * U3/U5 — `teal://vestara-shell` link-to-package mapping guards.
 *
 * - All nine `WinType` packages map 1:1 (`teal://vestara-shell/<type>`).
 * - Bare/host-only links land on the default package (`overview`).
 * - Wrong scheme, wrong host, ports, nested paths, unknown packages, and
 *   non-URLs all map to `null` — never a blind passthrough.
 * - Cold-start (`resolveColdStartWinType`) takes the first valid launch URL.
 * - Running-app (`handleIncomingDeepLinks`) opens the first valid incoming
 *   URL and ignores the rest without disturbing the session.
 *
 * Architecture Traceability:
 *   U3: teal://vestara-shell deep-link scheme
 */

/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import {
  DEEP_LINK_DEFAULT_WINTYPE,
  DEEP_LINK_HOST,
  DEEP_LINK_SCHEME,
  handleIncomingDeepLinks,
  parseDeepLinkToWinType,
  resolveColdStartWinType,
} from './deep-link';

describe('deep-link scheme identity', () => {
  it('pins the teal://vestara-shell scheme', () => {
    expect(DEEP_LINK_SCHEME).toBe('teal');
    expect(DEEP_LINK_HOST).toBe('vestara-shell');
    expect(DEEP_LINK_DEFAULT_WINTYPE).toBe('overview');
  });
});

describe('parseDeepLinkToWinType — canonical packages', () => {
  it.each([
    ['teal://vestara-shell/overview', 'overview'],
    ['teal://vestara-shell/workspace', 'workspace'],
    ['teal://vestara-shell/terminal', 'terminal'],
    ['teal://vestara-shell/marketplace', 'marketplace'],
    ['teal://vestara-shell/files', 'files'],
    ['teal://vestara-shell/settings', 'settings'],
    ['teal://vestara-shell/agent', 'agent'],
    ['teal://vestara-shell/diagnostic', 'diagnostic'],
    ['teal://vestara-shell/activity', 'activity'],
  ])('maps %s to %s', (link, wintype) => {
    expect(parseDeepLinkToWinType(link)).toBe(wintype);
  });

  it('lands bare and root links on the default package', () => {
    expect(parseDeepLinkToWinType('teal://vestara-shell')).toBe('overview');
    expect(parseDeepLinkToWinType('teal://vestara-shell/')).toBe('overview');
  });

  it('tolerates trailing slashes, duplicate slashes, and host case', () => {
    expect(parseDeepLinkToWinType('teal://vestara-shell/chat/')).toBeNull();
    expect(parseDeepLinkToWinType('teal://vestara-shell/terminal/')).toBe('terminal');
    expect(parseDeepLinkToWinType('teal://vestara-shell//terminal')).toBe('terminal');
    expect(parseDeepLinkToWinType('TEAL://VESTARA-SHELL/terminal')).toBe('terminal');
  });

  it('ignores query strings and hashes when resolving the package', () => {
    expect(parseDeepLinkToWinType('teal://vestara-shell/terminal?session=a')).toBe('terminal');
    expect(parseDeepLinkToWinType('teal://vestara-shell/activity#live')).toBe('activity');
  });
});

describe('parseDeepLinkToWinType — rejections', () => {
  it.each([
    'https://vestara-shell/terminal',
    'teal2://vestara-shell/terminal',
    'teal://other-host/terminal',
    'teal://vestara-shell.evil.example/terminal',
    'teal://vestara-shell:8080/terminal',
    'teal:vestara-shell/terminal',
    'teal://vestara-shell/does-not-exist',
    'teal://vestara-shell/chat',
    'teal://vestara-shell/terminal/extra-segment',
    'not a url at all',
    '',
  ])('maps %s to null', (link) => {
    expect(parseDeepLinkToWinType(link)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseDeepLinkToWinType(null)).toBeNull();
    expect(parseDeepLinkToWinType(undefined)).toBeNull();
    expect(parseDeepLinkToWinType(42)).toBeNull();
  });
});

describe('resolveColdStartWinType', () => {
  it('takes the first valid launch URL', async () => {
    await expect(
      resolveColdStartWinType({
        getCurrent: async () => ['teal://vestara-shell/nope', 'teal://vestara-shell/terminal'],
      }),
    ).resolves.toBe('terminal');
  });

  it('resolves null when nothing launched the app', async () => {
    await expect(resolveColdStartWinType({ getCurrent: async () => null })).resolves.toBeNull();
    await expect(resolveColdStartWinType({ getCurrent: async () => [] })).resolves.toBeNull();
    await expect(
      resolveColdStartWinType({ getCurrent: async () => ['teal://vestara-shell/nope'] }),
    ).resolves.toBeNull();
  });

  it('never throws when the plugin is unavailable', async () => {
    await expect(
      resolveColdStartWinType({
        getCurrent: async () => {
          throw new Error('denied');
        },
      }),
    ).resolves.toBeNull();
  });
});

describe('handleIncomingDeepLinks', () => {
  it('opens the first valid incoming URL', () => {
    const openType = vi.fn();
    const target = handleIncomingDeepLinks(
      ['https://example.com/x', 'teal://vestara-shell/terminal', 'teal://vestara-shell/activity'],
      openType,
    );
    expect(target).toBe('terminal');
    expect(openType).toHaveBeenCalledTimes(1);
    expect(openType).toHaveBeenCalledWith('terminal');
  });

  it('leaves the session untouched when nothing matches', () => {
    const openType = vi.fn();
    expect(handleIncomingDeepLinks(['teal://vestara-shell/nope'], openType)).toBeNull();
    expect(handleIncomingDeepLinks([], openType)).toBeNull();
    expect(openType).not.toHaveBeenCalled();
  });
});
