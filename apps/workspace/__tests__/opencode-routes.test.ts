import { describe, expect, it } from 'vitest';
import { NAV_CATEGORIES } from '../src/layouts/navigation.js';
import { openCodeQueryKeys } from '../src/lib/opencode.js';
import { APP_ROUTES } from '../src/routes.js';

describe('OpenCode route registration', () => {
  it('registers the /opencode route as an enabled shell route', () => {
    const route = APP_ROUTES.find((r) => r.id === 'opencode');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/opencode');
    expect(route?.title).toBe('OpenCode');
    expect(route?.enabled).toBe(true);
    expect(route?.layout).toBe('shell');
  });

  it('adds an OpenCode navigation entry', () => {
    const nav = NAV_CATEGORIES.flatMap((c) => c.items).find((item) => item.to === '/opencode/sessions');
    expect(nav).toBeDefined();
    expect(nav?.title).toBe('OpenCode Sessions');
  });

  it('exposes stable typed query keys', () => {
    expect(openCodeQueryKeys.health).toEqual(['opencode', 'health']);
    expect(openCodeQueryKeys.compatibility).toEqual(['opencode', 'compatibility']);
    expect(openCodeQueryKeys.overview).toEqual(['opencode', 'overview']);
  });
});
