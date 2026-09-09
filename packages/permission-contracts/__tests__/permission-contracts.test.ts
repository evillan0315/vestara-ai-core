import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSION_ACTIONS,
  isPermissionAction,
  normalizePermissionAction,
  classifyPermissionRisk,
} from '../src/index.js';

describe('PermissionAction', () => {
  it('has exactly 11 values', () => {
    expect(ALL_PERMISSION_ACTIONS).toHaveLength(11);
  });

  it('is closed and deterministic', () => {
    const unique = new Set(ALL_PERMISSION_ACTIONS);
    expect(unique.size).toBe(ALL_PERMISSION_ACTIONS.length);
  });

  it('isPermissionAction accepts all canonical values', () => {
    for (const action of ALL_PERMISSION_ACTIONS) {
      expect(isPermissionAction(action)).toBe(true);
    }
  });

  it('isPermissionAction rejects OpenCode-specific tool names', () => {
    // These are OpenCode tool names that normalize to 'other'
    expect(isPermissionAction('task')).toBe(false);
    expect(isPermissionAction('todowrite')).toBe(false);
    expect(isPermissionAction('lsp')).toBe(false);
    expect(isPermissionAction('skill')).toBe(false);
    expect(isPermissionAction('question')).toBe(false);
    expect(isPermissionAction('doom_loop')).toBe(false);
  });

  it('isPermissionAction rejects other unknown values', () => {
    expect(isPermissionAction('shell')).toBe(false);
    expect(isPermissionAction('fetch')).toBe(false);
    expect(isPermissionAction('unknown')).toBe(false);
  });

  it('does NOT contain runtime-specific values', () => {
    expect(ALL_PERMISSION_ACTIONS).not.toContain('shell');
    expect(ALL_PERMISSION_ACTIONS).not.toContain('fetch');
    expect(ALL_PERMISSION_ACTIONS).not.toContain('task');
    expect(ALL_PERMISSION_ACTIONS).not.toContain('doom_loop');
  });
});

describe('normalizePermissionAction', () => {
  it('passes through canonical values', () => {
    expect(normalizePermissionAction('read')).toBe('read');
    expect(normalizePermissionAction('edit')).toBe('edit');
    expect(normalizePermissionAction('bash')).toBe('bash');
  });

  it('normalizes shell → bash', () => {
    expect(normalizePermissionAction('shell')).toBe('bash');
  });

  it('normalizes fetch → webfetch', () => {
    expect(normalizePermissionAction('fetch')).toBe('webfetch');
  });

  it('normalizes command/execute → bash', () => {
    expect(normalizePermissionAction('command')).toBe('bash');
    expect(normalizePermissionAction('execute')).toBe('bash');
  });

  it('normalizes external_directory/external → external-directory', () => {
    expect(normalizePermissionAction('external_directory')).toBe('external-directory');
    expect(normalizePermissionAction('external')).toBe('external-directory');
  });

  it('maps OpenCode-specific tools to other', () => {
    expect(normalizePermissionAction('task')).toBe('other');
    expect(normalizePermissionAction('todowrite')).toBe('other');
    expect(normalizePermissionAction('lsp')).toBe('other');
    expect(normalizePermissionAction('skill')).toBe('other');
    expect(normalizePermissionAction('question')).toBe('other');
    expect(normalizePermissionAction('doom_loop')).toBe('other');
  });

  it('maps unknown to other', () => {
    expect(normalizePermissionAction('unknown')).toBe('other');
  });

  it('handles undefined input', () => {
    expect(normalizePermissionAction(undefined)).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(normalizePermissionAction('READ')).toBe('read');
    expect(normalizePermissionAction('Bash')).toBe('bash');
  });
});

describe('classifyPermissionRisk', () => {
  it('classifies bash/write/shell as dangerous', () => {
    expect(classifyPermissionRisk('bash')).toBe('dangerous');
    expect(classifyPermissionRisk('write')).toBe('dangerous');
    expect(classifyPermissionRisk('shell')).toBe('dangerous');
  });

  it('classifies edit/webfetch/fetch/command/execute as sensitive', () => {
    expect(classifyPermissionRisk('edit')).toBe('sensitive');
    expect(classifyPermissionRisk('webfetch')).toBe('sensitive');
    expect(classifyPermissionRisk('fetch')).toBe('sensitive');
    expect(classifyPermissionRisk('command')).toBe('sensitive');
    expect(classifyPermissionRisk('execute')).toBe('sensitive');
  });

  it('classifies read/glob/grep/list as safe', () => {
    expect(classifyPermissionRisk('read')).toBe('safe');
    expect(classifyPermissionRisk('glob')).toBe('safe');
    expect(classifyPermissionRisk('grep')).toBe('safe');
    expect(classifyPermissionRisk('list')).toBe('safe');
  });

  it('defaults unknown to safe', () => {
    expect(classifyPermissionRisk('unknown')).toBe('safe');
  });
});
