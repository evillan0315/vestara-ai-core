import { describe, expect, it } from 'vitest';
import { NAV_CATEGORIES } from '../src/layouts/navigation.js';
import { deriveSessionStatus, normalizeSession, openCodeQueryKeys } from '../src/lib/opencode.js';
import { APP_ROUTES } from '../src/routes.js';

describe('OpenCode session route registration', () => {
  it('registers the sessions list route', () => {
    const route = APP_ROUTES.find((r) => r.id === 'opencode-sessions');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/opencode/sessions');
    expect(route?.enabled).toBe(true);
    expect(route?.layout).toBe('shell');
  });

  it('registers the new-session route', () => {
    const route = APP_ROUTES.find((r) => r.id === 'opencode-new-session');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/opencode/sessions/new');
  });

  it('registers the session detail route with a sample param', () => {
    const route = APP_ROUTES.find((r) => r.id === 'opencode-session-detail');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/opencode/sessions/:sessionId');
    expect(route?.sampleParams).toEqual({ sessionId: 'session-sample' });
  });

  it('adds an OpenCode Sessions navigation entry', () => {
    const nav = NAV_CATEGORIES.flatMap((c) => c.items).find((item) => item.to === '/opencode/sessions');
    expect(nav).toBeDefined();
    expect(nav?.title).toBe('OpenCode Sessions');
  });
});

describe('OpenCode session query keys', () => {
  it('exposes list, detail, and status keys', () => {
    expect(openCodeQueryKeys.sessions).toEqual(['opencode', 'sessions']);
    expect(openCodeQueryKeys.session('ses_1')).toEqual(['opencode', 'sessions', 'ses_1']);
    expect(openCodeQueryKeys.status).toEqual(['opencode', 'sessions', 'status']);
  });
});

describe('session status normalization', () => {
  it('maps runtime statuses to display statuses', () => {
    expect(deriveSessionStatus('busy')).toBe('active');
    expect(deriveSessionStatus('idle')).toBe('idle');
    expect(deriveSessionStatus('error')).toBe('failed');
  });

  it('degrades unknown upstream status to unknown', () => {
    expect(deriveSessionStatus(undefined)).toBe('unknown');
    expect(deriveSessionStatus('weird')).toBe('unknown');
  });
});

describe('normalizeSession', () => {
  it('builds a view model with defaulted fields', () => {
    const view = normalizeSession(
      {
        id: 'ses_1',
        title: 'My session',
        agent: 'build',
        summary: { additions: 2, deletions: 1, files: 3 },
        time: { created: 1700000000000 },
      },
      'busy',
    );
    expect(view).toMatchObject({
      id: 'ses_1',
      title: 'My session',
      agent: 'build',
      status: 'active',
      additions: 2,
      deletions: 1,
      filesChanged: 3,
    });
    expect(view.createdAt).toBeTruthy();
  });

  it('falls back to slug and unknown status', () => {
    const view = normalizeSession({ id: 'ses_2', slug: 'silent-wizard' });
    expect(view.title).toBe('silent-wizard');
    expect(view.status).toBe('unknown');
    expect(view.additions).toBe(0);
  });
});
