import type { ResolvedConfiguration } from '@vestara/configuration';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistAppearanceSettings, persistThemeMode, resolveHydratedTheme } from '../appearance-durability.js';

function resolvedWith(entries: Array<{ key: string; value: unknown }>): ResolvedConfiguration {
  return {
    workspaceId: 'workspace-test',
    revision: 'rev-test',
    generatedAt: '2026-08-12T00:00:00.000Z',
    userConfigPath: '/user.json',
    workspaceConfigPath: '/workspace/.vestara/config.json',
    overrideCount: entries.length,
    settings: entries.map((entry) => ({
      key: entry.key,
      section: entry.key.startsWith('appearance') ? 'appearance' : 'general',
      value: entry.value as string | number | boolean | readonly string[],
      source: 'workspace',
      inherited: false,
      sensitive: false,
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveHydratedTheme', () => {
  it('re-applies an approved appearance after reload', () => {
    const approved = JSON.stringify({ colorTheme: 'emerald', fontFamily: 'mono', radius: 'none' });
    const hydrated = resolveHydratedTheme(resolvedWith([{ key: 'appearance.theme', value: approved }]));
    expect(hydrated.settings).toEqual({ colorTheme: 'emerald', fontFamily: 'mono', radius: 'none' });
    expect(hydrated.mode).toBeUndefined();
  });

  it('re-applies the approved theme mode', () => {
    const hydrated = resolveHydratedTheme(resolvedWith([{ key: 'general.theme', value: 'dark' }]));
    expect(hydrated.mode).toBe('dark');
  });

  it('ignores invalid stored appearance (not treated as truth)', () => {
    const hydrated = resolveHydratedTheme(resolvedWith([{ key: 'appearance.theme', value: '{not-json' }]));
    expect(hydrated.settings).toBeUndefined();
  });

  it('returns nothing when no durable appearance exists', () => {
    const hydrated = resolveHydratedTheme(resolvedWith([]));
    expect(hydrated.settings).toBeUndefined();
    expect(hydrated.mode).toBeUndefined();
  });
});

describe('durable appearance persistence (reachable user-visible path)', () => {
  it('persists appearance settings to the workspace settings API', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const ok = await persistAppearanceSettings({
      fontFamily: 'mono',
      fontSize: 'medium',
      fontWeight: 'normal',
      sidebarWidth: 'normal',
      spacing: 'comfortable',
      radius: 'medium',
      fullWidth: true,
      fullScreen: false,
      sidebarEnabled: true,
      sidebarMode: 'text',
      leftBorderEnabled: true,
      leftBorderColor: '#f59e0b',
      leftBorderThickness: 4,
      colorTheme: 'emerald',
    });

    expect(ok).toBe(true);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('/api/settings');
    const body = JSON.parse(String(call[1]?.body));
    expect(body.section).toBe('appearance');
    expect(body.overrides['appearance.theme']).toContain('"colorTheme":"emerald"');
    expect(body.source).toBe('workspace-ui');
  });

  it('persists the theme mode to general.theme', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const ok = await persistThemeMode('dark');

    expect(ok).toBe(true);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1]?.body));
    expect(body.section).toBe('general');
    expect(body.overrides['general.theme']).toBe('dark');
  });

  it('reports failure without throwing when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );
    expect(await persistThemeMode('light')).toBe(false);
  });
});
