import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidUiVersion,
  loadShellAppearance,
  SHELL_APPEARANCE_STORAGE_KEY,
  saveShellAppearance,
  settingsModuleCount,
  UI_VERSION_API_KEY,
  UI_VERSION_ENTRY_KEY,
  uiVersionDefault,
  uiVersionFixture,
  uiVersionOptions,
  workspaceSettingsModel,
} from './workspace-settings-model';

describe('workspace settings model (settings-framework)', () => {
  it('registers the workspace UI module entry once', () => {
    const first = workspaceSettingsModel();
    expect(first.entry.key).toBe(UI_VERSION_ENTRY_KEY);
    expect(first.entry.type).toBe('select');
    expect(first.entry.defaultValue).toBe('v1');
    expect(first.entry.metadata?.apiKey).toBe(UI_VERSION_API_KEY);
    expect(workspaceSettingsModel()).toBe(first);
  });

  it('exposes the fixture-backed toggle options + defaults', () => {
    expect(uiVersionOptions().map((option) => option.value)).toEqual(['v1', 'v2']);
    expect(uiVersionDefault()).toBe('v1');
    expect(uiVersionFixture()).toBe('v2');
  });

  it('validates values through the framework engine', async () => {
    await expect(isValidUiVersion('v1')).resolves.toBe(true);
    await expect(isValidUiVersion('v2')).resolves.toBe(true);
    await expect(isValidUiVersion('v3')).resolves.toBe(false);
    await expect(isValidUiVersion(undefined)).resolves.toBe(false);
  });
});

describe('shell appearance model (settings-framework)', () => {
  afterEach(() => {
    localStorage.removeItem(SHELL_APPEARANCE_STORAGE_KEY);
  });

  it('falls back to framework defaults when nothing is stored', async () => {
    await expect(loadShellAppearance()).resolves.toEqual({ accentTheme: 'shell', compactTopBar: true });
  });

  it('rejects invalid stored values field by field', async () => {
    localStorage.setItem(SHELL_APPEARANCE_STORAGE_KEY, JSON.stringify({ accentTheme: 'lava', compactTopBar: 'yes' }));
    await expect(loadShellAppearance()).resolves.toEqual({ accentTheme: 'shell', compactTopBar: true });
  });

  it('saves validated appearance and round-trips it', async () => {
    await expect(saveShellAppearance({ accentTheme: 'violet', compactTopBar: false })).resolves.toEqual({
      accentTheme: 'violet',
      compactTopBar: false,
    });
    await expect(loadShellAppearance()).resolves.toEqual({ accentTheme: 'violet', compactTopBar: false });
    await expect(saveShellAppearance({ accentTheme: 'nope' as never })).rejects.toThrow();
  });

  it('counts every registered settings module', () => {
    expect(settingsModuleCount()).toBeGreaterThanOrEqual(2);
  });
});
