/**
 * GA-EXEC-003 — the workspace setting is the assistant turn-budget authority.
 *
 * `assistantExecutionDefaults()` is the single read path the API adapter uses
 * when a turn arrives without a per-turn `executionConfig`. It must:
 *   - default to the same values the adapter enforces (150 calls / 60m);
 *   - reflect persisted workspace overrides, including an explicit 0
 *     (unlimited), which must never be dropped as falsy;
 *   - fall back to the defaults after a section reset.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_SETTING_DEFINITIONS, WorkspaceConfigurationService } from '../src/workspace-settings';

function serviceInTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-assistant-exec-'));
  const service = new WorkspaceConfigurationService(dir, 'test-ws', {
    userConfigPath: path.join(dir, 'user.json'),
    workspaceConfigPath: path.join(dir, 'config.json'),
  });
  return { dir, service };
}

describe('assistantExecutionDefaults', () => {
  it('defaults to the adapter-enforced 150 calls / 60m', () => {
    expect(WORKSPACE_SETTING_DEFINITIONS['assistantExecution.maxToolCalls'].defaultValue).toBe(150);
    expect(WORKSPACE_SETTING_DEFINITIONS['assistantExecution.turnTimeoutMs'].defaultValue).toBe(3_600_000);

    const { dir, service } = serviceInTempDir();
    expect(service.assistantExecutionDefaults()).toEqual({
      maxToolCalls: 150,
      turnTimeoutMs: 3_600_000,
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reflects persisted overrides, preserving an explicit 0 (unlimited)', () => {
    const { dir, service } = serviceInTempDir();
    service.save({
      section: 'assistant-execution',
      overrides: {
        'assistantExecution.maxToolCalls': 0,
        'assistantExecution.turnTimeoutMs': 900_000,
      },
    });

    expect(service.assistantExecutionDefaults()).toEqual({
      maxToolCalls: 0,
      turnTimeoutMs: 900_000,
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns to the defaults after a section reset', () => {
    const { dir, service } = serviceInTempDir();
    service.save({
      section: 'assistant-execution',
      overrides: { 'assistantExecution.maxToolCalls': 200 },
    });
    expect(service.assistantExecutionDefaults().maxToolCalls).toBe(200);

    service.resetSection('assistant-execution');
    expect(service.assistantExecutionDefaults()).toEqual({
      maxToolCalls: 150,
      turnTimeoutMs: 3_600_000,
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
