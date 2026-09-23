import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_SETTING_DEFINITIONS, WorkspaceConfigurationService } from '../src/workspace-settings';

describe('general.composerMaxChars', () => {
  it('is a general setting defaulting to 100000', () => {
    const definition = WORKSPACE_SETTING_DEFINITIONS['general.composerMaxChars'];
    expect(definition.section).toBe('general');
    expect(definition.defaultValue).toBe(100_000);
  });

  it('accepts integers within 1–100000', () => {
    const { validate } = WORKSPACE_SETTING_DEFINITIONS['general.composerMaxChars'];
    expect(validate(1)).toBe(true);
    expect(validate(4000)).toBe(true);
    expect(validate(100_000)).toBe(true);
  });

  it('rejects out-of-range and non-integer values', () => {
    const { validate } = WORKSPACE_SETTING_DEFINITIONS['general.composerMaxChars'];
    expect(validate(0)).toBe(false);
    expect(validate(-5)).toBe(false);
    expect(validate(100_001)).toBe(false);
    expect(validate(1.5)).toBe(false);
    expect(validate('100000')).toBe(false);
    expect(validate(Number.NaN)).toBe(false);
    expect(validate(undefined)).toBe(false);
  });

  it('resolves to the 100000 default and persists overrides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-composer-max-'));
    const service = new WorkspaceConfigurationService(dir, 'test-ws', {
      userConfigPath: path.join(dir, 'user.json'),
      workspaceConfigPath: path.join(dir, 'config.json'),
    });
    const resolved = service.resolve().settings.find((setting) => setting.key === 'general.composerMaxChars');
    expect(resolved?.value).toBe(100_000);

    const saved = service.save({ section: 'general', overrides: { 'general.composerMaxChars': 50_000 } });
    expect(saved.settings.find((setting) => setting.key === 'general.composerMaxChars')?.value).toBe(50_000);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
