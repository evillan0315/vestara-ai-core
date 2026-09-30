import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODEX_TRANSPORT_DEFAULT,
  CODEX_TRANSPORT_OPTIONS,
  WORKSPACE_SETTING_DEFINITIONS,
  WorkspaceConfigurationService,
} from '../src/workspace-settings';

function service(dir: string): WorkspaceConfigurationService {
  return new WorkspaceConfigurationService(dir, 'test-ws', {
    userConfigPath: path.join(dir, 'user.json'),
    workspaceConfigPath: path.join(dir, 'config.json'),
  });
}

describe('runtime.codexTransport', () => {
  it('has the canonical app-server default and supported values', () => {
    const definition = WORKSPACE_SETTING_DEFINITIONS['runtime.codexTransport'];
    expect(CODEX_TRANSPORT_OPTIONS).toEqual(['app-server', 'sdk']);
    expect(definition.defaultValue).toBe(CODEX_TRANSPORT_DEFAULT);
    expect(definition.validate('app-server')).toBe(true);
    expect(definition.validate('sdk')).toBe(true);
    expect(definition.validate('opencode')).toBe(false);
  });

  it('resolves the default and persists both supported selections', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-codex-transport-'));
    const configuration = service(dir);
    expect(configuration.resolve().settings.find((setting) => setting.key === 'runtime.codexTransport')?.value).toBe(
      'app-server',
    );

    const sdk = configuration.save({ section: 'runtime', overrides: { 'runtime.codexTransport': 'sdk' } });
    expect(sdk.settings.find((setting) => setting.key === 'runtime.codexTransport')?.value).toBe('sdk');
    expect(
      service(dir)
        .resolve()
        .settings.find((setting) => setting.key === 'runtime.codexTransport')?.value,
    ).toBe('sdk');

    const appServer = service(dir).save({ section: 'runtime', overrides: { 'runtime.codexTransport': 'app-server' } });
    expect(appServer.settings.find((setting) => setting.key === 'runtime.codexTransport')?.value).toBe('app-server');
    expect(() => service(dir).save({ section: 'runtime', overrides: { 'runtime.codexTransport': 'invalid' } })).toThrow(
      'Invalid value for runtime.codexTransport',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
