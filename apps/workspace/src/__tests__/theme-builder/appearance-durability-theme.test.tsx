import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider, useThemeBuilder } from '../../lib/theme-builder-context.js';
import { persistCustomThemes, loadCustomThemes, hydrateCustomThemes } from '../../lib/appearance-durability.js';
import type { CustomTheme } from '../../lib/theme.js';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeBuilderProvider>{children}</ThemeBuilderProvider>
);

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', mockLocalStorage());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ settings: [] }) }) as Response));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Custom themes persistence', () => {
  it('persists custom themes to localStorage on save', async () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-persist',
      name: 'Persist Theme',
      description: 'Test persistence',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: { '--vestara-accent': '#ff0000' },
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'vestara-custom-themes',
      expect.stringContaining('Persist Theme')
    );
  });

  it('loads custom themes from localStorage on mount', () => {
    const storedThemes: CustomTheme[] = [{
      id: 'custom-loaded',
      name: 'Loaded Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage(),
      getItem: vi.fn((key) => key === 'vestara-custom-themes' ? JSON.stringify(storedThemes) : null),
    });

    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.customThemes[0].name).toBe('Loaded Theme');
  });

  it('updates localStorage when custom themes change', async () => {
    const { result, rerender } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-update',
      name: 'Update Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });

    // Clear mock to track next call
    vi.clearAllMocks();
    const theme2: CustomTheme = {
      ...theme,
      id: 'custom-update-2',
      name: 'Update Theme 2',
    };
    await act(async () => {
      await result.current.saveTheme(theme2);
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'vestara-custom-themes',
      expect.stringContaining('Update Theme 2')
    );
  });

  it('persists to server via API on save', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-server',
      name: 'Server Theme',
      description: 'Test server sync',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/theme-builder',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Server Theme'),
      })
    );
  });

  it('uses PUT for existing theme update', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-existing',
      name: 'Existing Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });
    vi.clearAllMocks();

    const updatedTheme = { ...theme, name: 'Updated Theme' };
    await act(async () => {
      await result.current.saveTheme(updatedTheme);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/theme-builder',
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });

  it('deletes from localStorage on theme delete', async () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-delete',
      name: 'Delete Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });
    vi.clearAllMocks();

    await act(async () => {
      await result.current.deleteTheme('custom-delete');
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'vestara-custom-themes',
      '[]'
    );
  });

  it('deletes from server via API on theme delete', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-delete-server',
      name: 'Delete Server Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });
    vi.clearAllMocks();

    await act(async () => {
      await result.current.deleteTheme('custom-delete-server');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/theme-builder/custom-delete-server',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('persistCustomThemes', () => {
  it('stores themes in localStorage', async () => {
    const themes: CustomTheme[] = [{
      id: 'custom-1',
      name: 'Theme 1',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    await persistCustomThemes(themes);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'vestara-custom-themes',
      JSON.stringify(themes)
    );
  });

  it('sends themes to server', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const themes: CustomTheme[] = [{
      id: 'custom-1',
      name: 'Theme 1',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    await persistCustomThemes(themes);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('vestara-custom-themes'),
      })
    );
  });

  it('handles server failure gracefully', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const themes: CustomTheme[] = [{
      id: 'custom-1',
      name: 'Theme 1',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    // Should not throw
    await expect(persistCustomThemes(themes)).resolves.toBeUndefined();
  });
});

describe('loadCustomThemes', () => {
  it('returns empty array when no themes stored', () => {
    const themes = loadCustomThemes();
    expect(themes).toEqual([]);
  });

  it('returns parsed themes from localStorage', () => {
    const stored: CustomTheme[] = [{
      id: 'custom-1',
      name: 'Theme 1',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage(),
      getItem: vi.fn((key) => key === 'vestara-custom-themes' ? JSON.stringify(stored) : null),
    });

    const themes = loadCustomThemes();
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe('Theme 1');
  });

  it('returns empty array on parse error', () => {
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage(),
      getItem: vi.fn((key) => key === 'vestara-custom-themes' ? 'invalid json' : null),
    });

    const themes = loadCustomThemes();
    expect(themes).toEqual([]);
  });

  it('returns empty array when value is not an array', () => {
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage(),
      getItem: vi.fn((key) => key === 'vestara-custom-themes' ? '"not-an-array"' : null),
    });

    const themes = loadCustomThemes();
    expect(themes).toEqual([]);
  });
});

describe('hydrateCustomThemes', () => {
  it('fetches and parses themes from server', async () => {
    const serverThemes: CustomTheme[] = [{
      id: 'custom-server-1',
      name: 'Server Theme 1',
      description: 'From server',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        settings: [{
          key: 'vestara-custom-themes',
          section: 'appearance',
          value: JSON.stringify(serverThemes),
          source: 'workspace',
          inherited: false,
          sensitive: false,
        }],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const themes = await hydrateCustomThemes();
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe('Server Theme 1');
  });

  it('returns empty array on fetch failure', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const themes = await hydrateCustomThemes();
    expect(themes).toEqual([]);
  });

  it('returns empty array when no themes in settings', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ settings: [] }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    const themes = await hydrateCustomThemes();
    expect(themes).toEqual([]);
  });

  it('updates localStorage with server themes', async () => {
    const serverThemes: CustomTheme[] = [{
      id: 'custom-server-1',
      name: 'Server Theme 1',
      description: 'From server',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        settings: [{
          key: 'vestara-custom-themes',
          section: 'appearance',
          value: JSON.stringify(serverThemes),
          source: 'workspace',
          inherited: false,
          sensitive: false,
        }],
      }),
    }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    await hydrateCustomThemes();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'vestara-custom-themes',
      JSON.stringify(serverThemes)
    );
  });
});

describe('Theme persistence across reload', () => {
  it('survives provider remount', async () => {
    const { result, unmount } = renderHook(() => useThemeBuilder(), { wrapper });
    const theme: CustomTheme = {
      id: 'custom-survive',
      name: 'Survive Theme',
      description: 'Test reload',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: { '--vestara-accent': '#ff0000' },
      lightTokens: {},
      darkTokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await act(async () => {
      await result.current.saveTheme(theme);
    });
    expect(result.current.customThemes).toHaveLength(1);

    unmount();

    // Remount with same localStorage
    const { result: result2 } = renderHook(() => useThemeBuilder(), { wrapper });
    expect(result2.current.customThemes).toHaveLength(1);
    expect(result2.current.customThemes[0].name).toBe('Survive Theme');
    expect(result2.current.customThemes[0].tokens['--vestara-accent']).toBe('#ff0000');
  });
});