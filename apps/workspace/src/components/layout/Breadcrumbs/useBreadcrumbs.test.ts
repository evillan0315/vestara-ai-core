import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs } from './useBreadcrumbs';

describe('buildBreadcrumbs route resolution', () => {
  it.each([
    ['/sessions/session-123', 'Session Detail'],
    ['/qualification/profile-123/activity', 'Qualification Activity'],
    ['/opencode/sessions/new', 'New OpenCode Session'],
    ['/opencode/sessions/session-123', 'OpenCode Session'],
    ['/opencode/permissions', 'OpenCode Permissions'],
  ])('prefers the most specific route for %s', (pathname, expectedLabel) => {
    const crumbs = buildBreadcrumbs(pathname);

    expect(crumbs.at(-1)?.label).toBe(expectedLabel);
    expect(crumbs.at(-1)?.isCurrent).toBe(true);
  });

  it('keeps the static new-session route ahead of the dynamic session route', () => {
    const crumbs = buildBreadcrumbs('/opencode/sessions/new');

    expect(crumbs.at(-1)?.label).toBe('New OpenCode Session');
  });
});
