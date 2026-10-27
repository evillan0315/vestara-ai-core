import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeWorkspaceUiVersion,
  resolveWorkspaceUiVersion,
  WORKSPACE_UI_VERSION_DEFAULT,
  WORKSPACE_UI_VERSION_OPTIONS,
} from '../src/ui-version';
import { WORKSPACE_SETTING_DEFINITIONS, WorkspaceConfigurationService } from '../src/workspace-settings';

function service(dir: string): WorkspaceConfigurationService {
  return new WorkspaceConfigurationService(dir, 'test-ws', {
    userConfigPath: path.join(dir, 'user.json'),
    workspaceConfigPath: path.join(dir, 'config.json'),
  });
}

describe('general.workspaceUiVersion', () => {
  it('defaults to v1 with v1/v2 as the only valid values', () => {
    expect(WORKSPACE_UI_VERSION_DEFAULT).toBe('v1');
    expect([...WORKSPACE_UI_VERSION_OPTIONS]).toEqual(['v1', 'v2']);
    const definition = WORKSPACE_SETTING_DEFINITIONS['general.workspaceUiVersion'];
    expect(definition.section).toBe('general');
    expect(definition.defaultValue).toBe('v1');
    expect(definition.validate('v1')).toBe(true);
    expect(definition.validate('v2')).toBe(true);
    expect(definition.validate('v3')).toBe(false);
  });

  it('resolves the default and persists a v2 selection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-ui-version-'));
    try {
      const configuration = service(dir);
      expect(
        configuration.resolve().settings.find((setting) => setting.key === 'general.workspaceUiVersion')?.value,
      ).toBe('v1');
      const saved = configuration.save({ section: 'general', overrides: { 'general.workspaceUiVersion': 'v2' } });
      expect(saved.settings.find((setting) => setting.key === 'general.workspaceUiVersion')?.value).toBe('v2');
      expect(
        service(dir)
          .resolve()
          .settings.find((setting) => setting.key === 'general.workspaceUiVersion')?.value,
      ).toBe('v2');
      expect(() =>
        service(dir).save({ section: 'general', overrides: { 'general.workspaceUiVersion': 'v3' } }),
      ).toThrow('Invalid value for general.workspaceUiVersion');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes aliases and applies env-over-setting precedence', () => {
    expect(normalizeWorkspaceUiVersion('V2')).toBe('v2');
    expect(normalizeWorkspaceUiVersion('next')).toBe('v2');
    expect(normalizeWorkspaceUiVersion('classic')).toBe('v1');
    expect(normalizeWorkspaceUiVersion('v3')).toBe(null);
    expect(resolveWorkspaceUiVersion('v2', 'v1')).toBe('v2');
    expect(resolveWorkspaceUiVersion(undefined, 'v2')).toBe('v2');
    expect(resolveWorkspaceUiVersion('bogus', 'v2')).toBe('v2');
    expect(resolveWorkspaceUiVersion(undefined, undefined)).toBe('v1');
  });
});
