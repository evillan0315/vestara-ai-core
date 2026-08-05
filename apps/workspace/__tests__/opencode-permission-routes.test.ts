import { describe, expect, it } from 'vitest';
import { NAV_CATEGORIES } from '../src/layouts/navigation.js';
import {
  normalizePermissionRisk,
  normalizePermissionStatus,
  openCodeQueryKeys,
  permissionResourceSummary,
} from '../src/lib/opencode.js';
import { APP_ROUTES } from '../src/routes.js';

describe('OpenCode permission route registration', () => {
  it('registers the permissions route', () => {
    const route = APP_ROUTES.find((r) => r.id === 'opencode-permissions');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/opencode/permissions');
    expect(route?.enabled).toBe(true);
    expect(route?.layout).toBe('shell');
  });

  it('adds an OpenCode Permissions navigation entry', () => {
    const nav = NAV_CATEGORIES.flatMap((c) => c.items).find((item) => item.to === '/opencode/permissions');
    expect(nav).toBeDefined();
    expect(nav?.title).toBe('OpenCode Permissions');
  });

  it('exposes a stable permissions query key', () => {
    expect(openCodeQueryKeys.permissions).toEqual(['opencode', 'permissions']);
  });
});

describe('permission normalization', () => {
  it('preserves known statuses and degrades unknown', () => {
    expect(normalizePermissionStatus('pending')).toBe('pending');
    expect(normalizePermissionStatus('approved')).toBe('approved');
    expect(normalizePermissionStatus('rejected')).toBe('rejected');
    expect(normalizePermissionStatus('expired')).toBe('expired');
    expect(normalizePermissionStatus(undefined)).toBe('unknown');
    expect(normalizePermissionStatus('weird')).toBe('unknown');
  });

  it('preserves risk levels and degrades unknown to safe', () => {
    expect(normalizePermissionRisk('dangerous')).toBe('dangerous');
    expect(normalizePermissionRisk('sensitive')).toBe('sensitive');
    expect(normalizePermissionRisk(undefined)).toBe('safe');
    expect(normalizePermissionRisk('huge')).toBe('safe');
  });

  it('summarizes resources with a count for multiple entries', () => {
    expect(
      permissionResourceSummary({
        id: 'p1',
        action: 'read',
        resources: ['/a'],
        risk: 'safe',
        status: 'pending',
        askedAt: '',
      }),
    ).toBe('/a');
    expect(
      permissionResourceSummary({
        id: 'p2',
        action: 'read',
        resources: ['/a', '/b', '/c'],
        risk: 'safe',
        status: 'pending',
        askedAt: '',
      }),
    ).toBe('/a +2 more');
  });
});
