import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAVIGATION } from '../src/layouts/workspace-navigation.js';
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
    const nav = WORKSPACE_NAVIGATION.find((entry) => entry.path === '/opencode/sessions');
    expect(nav).toBeDefined();
    expect(nav?.label).toBe('OpenCode Sessions');
  });

  it('exposes stable typed query keys', () => {
    expect(openCodeQueryKeys.health).toEqual(['opencode', 'health']);
    expect(openCodeQueryKeys.compatibility).toEqual(['opencode', 'compatibility']);
    expect(openCodeQueryKeys.overview).toEqual(['opencode', 'overview']);
  });
});
