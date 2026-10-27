import { describe, expect, it } from 'vitest';
import { resolveUiDistDir, resolveWorkspaceUiVersion, UI_DIST_V1, UI_DIST_V2 } from '../src/server';

describe('workspace UI version toggle', () => {
  it('defaults to v1 and selects the v1 dist', () => {
    expect(resolveWorkspaceUiVersion({})).toBe('v1');
    expect(resolveUiDistDir({})).toBe(UI_DIST_V1);
    expect(UI_DIST_V1).toMatch(/apps[\\/]workspace[\\/]dist$/);
  });

  it('selects the v2 dist for v2 aliases', () => {
    expect(resolveWorkspaceUiVersion({ VESTARA_WORKSPACE_UI_VERSION: 'v2' })).toBe('v2');
    expect(resolveUiDistDir({ VESTARA_WORKSPACE_UI_VERSION: 'v2' })).toBe(UI_DIST_V2);
    expect(resolveWorkspaceUiVersion({ VESTARA_WORKSPACE_UI_VERSION: 'next' })).toBe('v2');
    expect(UI_DIST_V2).toMatch(/apps[\\/]workspace-ui-v2[\\/]dist$/);
  });

  it('falls back to v1 on unknown values', () => {
    expect(resolveWorkspaceUiVersion({ VESTARA_WORKSPACE_UI_VERSION: 'v3' })).toBe('v1');
    expect(resolveUiDistDir({ VESTARA_WORKSPACE_UI_VERSION: 'v3' })).toBe(UI_DIST_V1);
  });

  it('reads the persisted setting when the env var is unset', () => {
    expect(resolveWorkspaceUiVersion({}, 'v2')).toBe('v2');
    expect(resolveUiDistDir({}, 'v2')).toBe(UI_DIST_V2);
    expect(resolveWorkspaceUiVersion({}, 'v1')).toBe('v1');
    expect(resolveWorkspaceUiVersion({}, undefined)).toBe('v1');
    expect(resolveWorkspaceUiVersion({}, 'bogus')).toBe('v1');
  });

  it('prefers the env var over the persisted setting', () => {
    expect(resolveWorkspaceUiVersion({ VESTARA_WORKSPACE_UI_VERSION: 'v1' }, 'v2')).toBe('v1');
    expect(resolveWorkspaceUiVersion({ VESTARA_WORKSPACE_UI_VERSION: 'v2' }, 'v1')).toBe('v2');
    expect(resolveUiDistDir({ VESTARA_WORKSPACE_UI_VERSION: 'v2' }, 'v1')).toBe(UI_DIST_V2);
  });
});
