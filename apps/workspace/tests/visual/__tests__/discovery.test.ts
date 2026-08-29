// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ADMIN_ROUTES, HIDDEN_ROUTES, RouteDiscovery } from '../routes/discovery';
import type { RouteDefinition } from '../routes/manifest';

function route(id: string, enabled = true): RouteDefinition {
  return { id, path: `/${id}`, url: `/${id}`, title: id, requiresAuth: false, enabled, layout: 'shell' };
}

describe('RouteDiscovery', () => {
  it('excludes hidden, admin, dev, and disabled routes by default', () => {
    const discovery = new RouteDiscovery({ extra: [route('my-custom-page'), route('disabled-page', false)] });
    const ids = discovery.discover().map((r) => r.id);
    for (const hidden of [...HIDDEN_ROUTES, ...ADMIN_ROUTES]) expect(ids).not.toContain(hidden);
    expect(ids).not.toContain('disabled-page');
    // Enabled extras are included (not excluded by default).
    expect(ids).toContain('my-custom-page');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('supports manual exclusion via options', () => {
    const discovery = new RouteDiscovery({ extra: [route('settings')], exclude: ['settings'] });
    expect(discovery.discover().map((r) => r.id)).not.toContain('settings');
  });

  it('filters routes by id or title substring', () => {
    const discovery = new RouteDiscovery({
      extra: [route('dashboard'), route('settings'), route('projects')],
      filter: 'settings',
    });
    const ids = discovery.discover().map((r) => r.id);
    expect(ids).toContain('settings');
    expect(ids).not.toContain('dashboard');
  });

  it('never returns disabled routes', () => {
    const discovery = new RouteDiscovery({ extra: [route('hidden', false)] });
    expect(discovery.discover().map((r) => r.id)).not.toContain('hidden');
  });
});
