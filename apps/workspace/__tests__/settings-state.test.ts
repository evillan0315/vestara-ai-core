import type { ResolvedConfiguration } from '@vestara/configuration';
import { describe, expect, it } from 'vitest';
import { createDraft, draftOverrides, updateDraft } from '../src/pages/Settings/settings-state.js';

const configuration: ResolvedConfiguration = {
  workspaceId: 'workspace-test',
  revision: 'revision-1',
  generatedAt: '2026-08-01T00:00:00.000Z',
  userConfigPath: '/user/config.json',
  workspaceConfigPath: '/workspace/.vestara/config.json',
  overrideCount: 0,
  settings: [
    { key: 'general.theme', section: 'general', value: 'system', source: 'default', inherited: true, sensitive: false },
    { key: 'verification.profile', section: 'verification', value: 'standard', source: 'default', inherited: true, sensitive: false },
  ],
};

describe('settings draft state', () => {
  it('tracks only changed fields as explicit overrides', () => {
    const initial = createDraft(configuration, 'general');
    expect(initial.dirtyKeys).toEqual([]);
    const changed = updateDraft(initial, 'general.theme', 'dark');
    expect(draftOverrides(changed)).toEqual({ 'general.theme': 'dark' });
    expect(initial.values['general.theme']).toBe('system');
  });

  it('resets section state from newly resolved server configuration', () => {
    const draft = createDraft(configuration, 'verification');
    expect(draft.values).toEqual({ 'verification.profile': 'standard' });
    expect(draft.dirtyKeys).toEqual([]);
  });
});
