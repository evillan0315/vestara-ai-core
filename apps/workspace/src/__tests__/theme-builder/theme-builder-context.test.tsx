import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider, useThemeBuilder } from '../../lib/theme-builder-context.js';
import type { CustomTheme, SemanticToken, TokenCategory } from '../../lib/theme.js';

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ThemeBuilderProvider', () => {
  it('provides default editing theme on mount', () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    expect(result.current.editingTheme).not.toBeNull();
    expect(result.current.editingTheme?.name).toBe('New Theme');
    expect(result.current.editingTheme?.isBuiltIn).toBe(false);
  });

  it('generates built-in themes (9 accents × 4 profiles = 36)', () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    expect(result.current.builtInThemes).toHaveLength(36);
  });

  it('loads custom themes from localStorage', () => {
    const customThemes: CustomTheme[] = [{
      id: 'custom-1',
      name: 'Test Theme',
      description: 'Test',
      isBuiltIn: false,
      baseThemeId: 'gold',
      tokens: {},
      profile: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    vi.stubGlobal('localStorage', {
      ...mockLocalStorage(),
      getItem: vi.fn((key) => key === 'vestara-custom-themes' ? JSON.stringify(customThemes) : null),
    });

    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.customThemes[0].name).toBe('Test Theme');
  });

  it('getTokensByCategory returns correct tokens', () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const accentTokens = result.current.getTokensByCategory('color-accent');
    expect(accentTokens.length).toBeGreaterThan(0);
    expect(accentTokens.every(t => t.category === 'color-accent')).toBe(true);
  });

  it('getTokenByCssVar finds token by css variable', () => {
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const token = result.current.getTokenByCssVar('--vestara-accent');
    expect(token).toBeDefined();
    expect(token?.cssVar).toBe('--vestara-accent');
  });

  describe('updateToken', () => {
    it('updates token value in editing theme', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#ff0000');
      });
      expect(result.current.editingTheme?.tokens['--vestara-accent']).toBe('#ff0000');
    });

    it('updates light token when mode is light', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#ff0000', 'light');
      });
      expect(result.current.editingTheme?.lightTokens['--vestara-accent']).toBe('#ff0000');
    });

    it('updates dark token when mode is dark', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#00ff00', 'dark');
      });
      expect(result.current.editingTheme?.darkTokens['--vestara-accent']).toBe('#00ff00');
    });

    it('updates updatedAt timestamp', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const before = result.current.editingTheme?.updatedAt;
      act(() => {
        vi.advanceTimersByTime(1000);
        result.current.updateToken('--vestara-accent', '#ff0000');
      });
      expect(result.current.editingTheme?.updatedAt).not.toBe(before);
    });
  });

  describe('resetToken', () => {
    it('resets token to default value', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#ff0000');
      });
      act(() => {
        result.current.resetToken('--vestara-accent');
      });
      expect(result.current.editingTheme?.tokens['--vestara-accent']).toBe('#f59e0b');
    });

    it('resets light/dark tokens when they exist', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#ff0000', 'light');
        result.current.updateToken('--vestara-accent', '#00ff00', 'dark');
      });
      act(() => {
        result.current.resetToken('--vestara-accent');
      });
      expect(result.current.editingTheme?.lightTokens['--vestara-accent']).toBe('#b45309');
      expect(result.current.editingTheme?.darkTokens['--vestara-accent']).toBe('#f59e0b');
    });
  });

  describe('loadTheme', () => {
    it('loads a theme into editing state', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-test',
        name: 'Loaded Theme',
        description: 'Test',
        isBuiltIn: false,
        baseThemeId: 'gold',
        tokens: { '--vestara-accent': '#ff0000' },
        lightTokens: {},
        darkTokens: {},
        profile: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      act(() => {
        result.current.loadTheme(theme);
      });
      expect(result.current.editingTheme?.name).toBe('Loaded Theme');
      expect(result.current.editingTheme?.tokens['--vestara-accent']).toBe('#ff0000');
    });
  });

  describe('saveTheme', () => {
    it('saves new custom theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-new',
        name: 'New Custom Theme',
        description: 'Test',
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
      expect(result.current.customThemes[0].name).toBe('New Custom Theme');
    });

    it('updates existing custom theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-existing',
        name: 'Existing Theme',
        description: 'Test',
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

      const updatedTheme = { ...theme, name: 'Updated Theme', tokens: { '--vestara-accent': '#00ff00' } };
      await act(async () => {
        await result.current.saveTheme(updatedTheme);
      });
      expect(result.current.customThemes).toHaveLength(1);
      expect(result.current.customThemes[0].name).toBe('Updated Theme');
      expect(result.current.customThemes[0].tokens['--vestara-accent']).toBe('#00ff00');
    });

    it('converts built-in theme to custom on save', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const builtIn = result.current.builtInThemes[0];
      const toSave = { ...builtIn, name: 'Customized Built-in' };
      await act(async () => {
        await result.current.saveTheme(toSave);
      });
      expect(result.current.customThemes).toHaveLength(1);
      expect(result.current.customThemes[0].isBuiltIn).toBe(false);
      expect(result.current.customThemes[0].id).toMatch(/^custom-/);
    });
  });

  describe('deleteTheme', () => {
    it('deletes custom theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-to-delete',
        name: 'To Delete',
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
      expect(result.current.customThemes).toHaveLength(1);

      await act(async () => {
        await result.current.deleteTheme('custom-to-delete');
      });
      expect(result.current.customThemes).toHaveLength(0);
    });

    it('does not delete built-in theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const builtIn = result.current.builtInThemes[0];
      await act(async () => {
        await result.current.deleteTheme(builtIn.id);
      });
      expect(result.current.builtInThemes).toHaveLength(36);
    });

    it('resets editing theme if deleted theme was being edited', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-editing',
        name: 'Editing Theme',
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
      act(() => {
        result.current.loadTheme(theme);
      });
      expect(result.current.editingTheme?.id).toBe('custom-editing');

      await act(async () => {
        await result.current.deleteTheme('custom-editing');
      });
      expect(result.current.editingTheme?.name).toBe('New Theme');
    });
  });

  describe('createFromPreset', () => {
    it('creates custom theme from built-in preset', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const baseTheme = result.current.builtInThemes[0];
      let newTheme: CustomTheme;
      act(() => {
        newTheme = result.current.createFromPreset(baseTheme.id, { name: 'Custom from Preset' });
      });
      expect(newTheme!.isBuiltIn).toBe(false);
      expect(newTheme!.name).toBe('Custom from Preset');
      expect(newTheme!.baseThemeId).toBe(baseTheme.baseThemeId);
    });

    it('creates custom theme from custom theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-base',
        name: 'Base Custom',
        description: 'Test',
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
        await result.current.saveTheme(customTheme);
      });
      let newTheme: CustomTheme;
      act(() => {
        newTheme = result.current.createFromPreset('custom-base', { name: 'Derived Custom' });
      });
      expect(newTheme!.isBuiltIn).toBe(false);
      expect(newTheme!.tokens['--vestara-accent']).toBe('#ff0000');
    });

    it('throws when base theme not found', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      expect(() => {
        act(() => {
          result.current.createFromPreset('non-existent', {});
        });
      }).toThrow('Base theme not found');
    });
  });

  describe('applyThemeToPreview', () => {
    it('calls setProperty for each token', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme: CustomTheme = {
        id: 'custom-preview',
        name: 'Preview Theme',
        description: 'Test',
        isBuiltIn: false,
        baseThemeId: 'gold',
        tokens: { '--vestara-accent': '#ff0000', '--color-zinc-950': '#000000' },
        lightTokens: {},
        darkTokens: {},
        profile: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');
      
      act(() => {
        result.current.applyThemeToPreview(theme);
      });
      
      expect(setPropertySpy).toHaveBeenCalledWith('--vestara-accent', '#ff0000');
      expect(setPropertySpy).toHaveBeenCalledWith('--color-zinc-950', '#000000');
      
      setPropertySpy.mockRestore();
    });
  });

  describe('togglePreview', () => {
    it('toggles preview mode', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      expect(result.current.previewMode).toBe(false);
      act(() => {
        result.current.togglePreview();
      });
      expect(result.current.previewMode).toBe(true);
      act(() => {
        result.current.togglePreview();
      });
      expect(result.current.previewMode).toBe(false);
    });
  });

  describe('resetEditingTheme', () => {
    it('resets to default editing theme', () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      act(() => {
        result.current.updateToken('--vestara-accent', '#ff0000');
      });
      act(() => {
        result.current.resetEditingTheme();
      });
      expect(result.current.editingTheme?.name).toBe('New Theme');
      expect(result.current.editingTheme?.tokens['--vestara-accent']).toBe('#f59e0b');
    });
  });
});

describe('useThemeBuilder hook', () => {
  it('throws when used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useThemeBuilder());
    }).toThrow('useThemeBuilder requires ThemeBuilderProvider');
    consoleError.mockRestore();
  });
});