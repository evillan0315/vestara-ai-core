import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkspaceCommand,
  serializeWorkspaceCommand,
  WorkspaceConfigurationService,
  workspaceDeepLink,
} from '../src/workspace-settings.js';

const temporaryDirectories: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-settings-'));
  temporaryDirectories.push(root);
  const userConfigPath = path.join(root, 'user.json');
  const workspaceConfigPath = path.join(root, '.vestara', 'config.json');
  const service = new WorkspaceConfigurationService(root, 'workspace-test', { userConfigPath, workspaceConfigPath });
  return { root, userConfigPath, workspaceConfigPath, service };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('WorkspaceConfigurationService', () => {
  it('resolves default, user, workspace, session, and command precedence with provenance', () => {
    const { userConfigPath, workspaceConfigPath, service } = fixture();
    fs.writeFileSync(userConfigPath, JSON.stringify({ overrides: { 'general.theme': 'light' } }));
    fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
    fs.writeFileSync(workspaceConfigPath, JSON.stringify({ overrides: { 'general.theme': 'dark' } }));
    service.setSessionOverrides({ 'general.theme': 'system' });

    expect(service.resolve().settings.find((setting) => setting.key === 'general.theme')).toMatchObject({
      value: 'system',
      source: 'session',
      inherited: true,
    });
    expect(
      service.resolve({ 'general.theme': 'light' }).settings.find((setting) => setting.key === 'general.theme'),
    ).toMatchObject({
      value: 'light',
      source: 'command',
    });
  });

  it('persists only explicit workspace overrides and resets to inherited values', () => {
    const { userConfigPath, workspaceConfigPath, service } = fixture();
    fs.writeFileSync(userConfigPath, JSON.stringify({ overrides: { 'general.theme': 'light' } }));
    const initial = service.resolve();
    const saved = service.save({
      section: 'general',
      overrides: { 'general.theme': 'dark' },
      expectedRevision: initial.revision,
    });
    expect(saved.settings.find((setting) => setting.key === 'general.theme')).toMatchObject({
      source: 'workspace',
      inherited: false,
    });
    expect(JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8')).overrides).toEqual({ 'general.theme': 'dark' });

    const reset = service.resetSection('general', saved.revision);
    expect(reset.settings.find((setting) => setting.key === 'general.theme')).toMatchObject({
      value: 'light',
      source: 'user',
      inherited: true,
    });
  });

  it('rejects invalid values, wrong sections, and concurrent writes', () => {
    const { service } = fixture();
    const initial = service.resolve();
    expect(() => service.save({ section: 'general', overrides: { 'general.theme': 'purple' } })).toThrow(
      'Invalid value',
    );
    expect(() => service.save({ section: 'general', overrides: { 'verification.profile': 'strict' } })).toThrow(
      'not valid',
    );
    service.save({ section: 'general', overrides: { 'general.theme': 'dark' } });
    expect(() => service.save({ section: 'general', overrides: {}, expectedRevision: initial.revision })).toThrow(
      'changed since',
    );
  });
});

describe('shared workspace commands', () => {
  it('serializes commands and carries origin and correlation metadata', () => {
    const command = createWorkspaceCommand({
      workspaceId: 'vestara-ai-core',
      source: 'workspace-ui',
      type: 'graph.rebuild',
    });
    expect(command.commandId).toBe(command.correlationId);
    expect(command.source).toBe('workspace-ui');
    expect(serializeWorkspaceCommand(command)).toContain('vestara graph rebuild');
  });

  it('generates stable encoded deep links', () => {
    expect(workspaceDeepLink('core workspace', { entityId: 'file:src/index.ts' })).toBe(
      'vestara://workspace/core%20workspace/entities/file%3Asrc%2Findex.ts',
    );
  });

  it('serializes routing commands for Console parity', () => {
    const command = createWorkspaceCommand({
      workspaceId: 'vestara-ai-core',
      source: 'cli',
      type: 'routing.preview',
      payload: { role: 'developer', agentId: 'developer-01' },
    });
    expect(serializeWorkspaceCommand(command)).toContain('vestara routing preview');
  });
});
