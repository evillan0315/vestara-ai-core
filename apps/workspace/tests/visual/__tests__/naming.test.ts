// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Theme, Viewport } from '../config';
import { routeBaseName, screenshotName, shotKey } from '../helpers/naming';
import type { RouteDefinition } from '../routes/manifest';

const route: RouteDefinition = {
  id: 'session-detail',
  path: '/sessions/:id',
  url: '/sessions/sample',
  title: 'Session Detail',
  requiresAuth: true,
  enabled: true,
  layout: 'shell',
};

const viewport: Viewport = { id: 'desktop-1920', name: 'Desktop 1920x1080', width: 1920, height: 1080 };
const theme: Theme = { id: 'dark', label: 'Dark', storageValue: 'dark' };

describe('naming', () => {
  it('produces deterministic Title.viewport.theme.png names', () => {
    expect(screenshotName(route, viewport, theme)).toBe('session-detail.desktop-1920.dark.png');
  });

  it('appends a role suffix for non-admin roles', () => {
    expect(screenshotName(route, viewport, theme, { role: 'reviewer' })).toBe(
      'session-detail.desktop-1920.dark.reviewer.png',
    );
    expect(screenshotName(route, viewport, theme, { role: 'admin' })).toBe('session-detail.desktop-1920.dark.png');
  });

  it('sanitizes unsafe characters in titles', () => {
    const odd: RouteDefinition = { ...route, title: 'API / Builder (v2)!' };
    expect(routeBaseName(odd)).toBe('api-builder-v2');
  });

  it('builds a stable shot key', () => {
    expect(shotKey(route, viewport, theme)).toBe('session-detail@desktop-1920@dark');
    expect(shotKey(route, viewport, theme, 'reviewer')).toBe('session-detail@desktop-1920@dark@reviewer');
  });
});
