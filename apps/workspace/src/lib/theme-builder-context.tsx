import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadCustomThemes, persistCustomThemes, hydrateCustomThemes as hydrateCustomThemesFromServer } from './appearance-durability';
import {
  ACCENT_PALETTES,
  applySettings,
  type CustomTheme,
  DEFAULT_SETTINGS,
  PROFILES,
  SEMANTIC_TOKENS,
  type SemanticToken,
  type ThemeSettings,
  type TokenCategory,
} from './theme';

interface ThemeBuilderState {
  editingTheme: CustomTheme | null;
  previewMode: boolean;
  customThemes: CustomTheme[];
  builtInThemes: CustomTheme[];
}

interface ThemeBuilderContextValue extends ThemeBuilderState {
  updateToken: (cssVar: string, value: string, mode?: 'light' | 'dark') => void;
  resetToken: (cssVar: string) => void;
  loadTheme: (theme: CustomTheme) => void;
  saveTheme: (theme: CustomTheme) => Promise<void>;
  deleteTheme: (id: string) => Promise<void>;
  togglePreview: () => void;
  createFromPreset: (baseThemeId: string, overrides: Partial<CustomTheme>) => CustomTheme;
  resetEditingTheme: () => void;
  applyThemeToPreview: (theme: CustomTheme) => void;
  getTokenByCssVar: (cssVar: string) => SemanticToken | undefined;
  getTokensByCategory: (category: TokenCategory) => readonly SemanticToken[];
  hydrateFromServer: () => Promise<void>;
}

const ThemeBuilderContext = createContext<ThemeBuilderContextValue | null>(null);

function generateBuiltInThemes(): CustomTheme[] {
  const builtIn: CustomTheme[] = [];
  const now = new Date().toISOString();

  for (const [accentId, accent] of Object.entries(ACCENT_PALETTES)) {
    for (const profile of PROFILES) {
      const id = `built-in-${accentId}-${profile.id}`;
      const tokens: Record<string, string> = {};
      const lightTokens: Record<string, string> = {};
      const darkTokens: Record<string, string> = {};

      for (const token of SEMANTIC_TOKENS) {
        if (token.cssVar.startsWith('--vestara-accent')) {
          const baseValue = token.defaultValue;
          tokens[token.cssVar] = baseValue;
          if (token.lightValue) lightTokens[token.cssVar] = token.lightValue;
          if (token.darkValue) darkTokens[token.cssVar] = token.darkValue;
        } else {
          tokens[token.cssVar] = token.defaultValue;
        }
      }

      const themeSettings: Partial<ThemeSettings> = {
        colorTheme: accentId as ThemeSettings['colorTheme'],
        fontFamily: profile.settings.fontFamily,
        fontSize: profile.settings.fontSize,
        fontWeight: profile.settings.fontWeight,
        sidebarWidth: profile.settings.sidebarWidth,
        spacing: profile.settings.spacing,
        radius: profile.settings.radius,
        fullWidth: profile.settings.fullWidth,
        fullScreen: profile.settings.fullScreen,
        sidebarEnabled: profile.settings.sidebarEnabled,
        sidebarMode: profile.settings.sidebarMode,
        leftBorderEnabled: profile.settings.leftBorderEnabled,
        leftBorderColor: profile.settings.leftBorderColor,
        leftBorderThickness: profile.settings.leftBorderThickness,
      };

      builtIn.push({
        id,
        name: `${accent.label} · ${profile.label}`,
        description: `Built-in theme: ${accent.label} accent with ${profile.label.toLowerCase()} profile`,
        isBuiltIn: true,
        baseThemeId: accentId,
        tokens,
        lightTokens,
        darkTokens,
        profile: themeSettings,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return builtIn;
}

function createDefaultEditingTheme(): CustomTheme {
  const now = new Date().toISOString();
  const tokens: Record<string, string> = {};
  const lightTokens: Record<string, string> = {};
  const darkTokens: Record<string, string> = {};

  for (const token of SEMANTIC_TOKENS) {
    tokens[token.cssVar] = token.defaultValue;
    if (token.lightValue) lightTokens[token.cssVar] = token.lightValue;
    if (token.darkValue) darkTokens[token.cssVar] = token.darkValue;
  }

  return {
    id: `custom-${Date.now()}`,
    name: 'New Theme',
    description: 'Custom theme created from default',
    isBuiltIn: false,
    baseThemeId: 'gold',
    tokens,
    lightTokens,
    darkTokens,
    profile: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

export function ThemeBuilderProvider({ children }: { children: ReactNode }) {
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [builtInThemes] = useState<CustomTheme[]>(generateBuiltInThemes());
  const [hydrated, setHydrated] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);

  const hydrateFromServer = useCallback(async () => {
    try {
      const serverThemes = await hydrateCustomThemesFromServer();
      if (serverThemes.length > 0) {
        setCustomThemes(serverThemes);
        setServerSynced(true);
      }
    } catch {
      // Server unavailable, keep localStorage
    }
  }, []);

  useEffect(() => {
    const loaded = loadCustomThemes();
    setCustomThemes(loaded);
    setHydrated(true);
    // Also try to hydrate from server
    hydrateFromServer();
  }, [hydrateFromServer]);

  useEffect(() => {
    if (!hydrated) return;
    persistCustomThemes(customThemes).catch(console.error);
  }, [customThemes, hydrated]);

  const resetEditingTheme = useCallback(() => {
    setEditingTheme(createDefaultEditingTheme());
  }, []);

  useEffect(() => {
    if (!editingTheme) {
      resetEditingTheme();
    }
  }, [editingTheme, resetEditingTheme]);

  const getTokenByCssVar = useCallback((cssVar: string): SemanticToken | undefined => {
    return SEMANTIC_TOKENS.find((t) => t.cssVar === cssVar);
  }, []);

  const getTokensByCategory = useCallback((category: TokenCategory): readonly SemanticToken[] => {
    return SEMANTIC_TOKENS.filter((t) => t.category === category);
  }, []);

  const updateToken = useCallback((cssVar: string, value: string, mode?: 'light' | 'dark') => {
    setEditingTheme((prev) => {
      if (!prev) return prev;
      const next = { ...prev, updatedAt: new Date().toISOString() };
      if (mode === 'light') {
        next.lightTokens = { ...prev.lightTokens, [cssVar]: value };
      } else if (mode === 'dark') {
        next.darkTokens = { ...prev.darkTokens, [cssVar]: value };
      } else {
        next.tokens = { ...prev.tokens, [cssVar]: value };
      }
      return next;
    });
  }, []);

  const resetToken = useCallback((cssVar: string) => {
    const token = SEMANTIC_TOKENS.find((t) => t.cssVar === cssVar);
    if (!token) return;
    setEditingTheme((prev) => {
      if (!prev) return prev;
      const next = { ...prev, updatedAt: new Date().toISOString() };
      next.tokens = { ...prev.tokens, [cssVar]: token.defaultValue };
      if (token.lightValue) {
        next.lightTokens = { ...prev.lightTokens, [cssVar]: token.lightValue };
      } else {
        const { [cssVar]: _removed, ...restLight } = prev.lightTokens || {};
        next.lightTokens = restLight;
      }
      if (token.darkValue) {
        next.darkTokens = { ...prev.darkTokens, [cssVar]: token.darkValue };
      } else {
        const { [cssVar]: _removed, ...restDark } = prev.darkTokens || {};
        next.darkTokens = restDark;
      }
      return next;
    });
  }, []);

  const loadTheme = useCallback((theme: CustomTheme) => {
    setEditingTheme({ ...theme, updatedAt: new Date().toISOString() });
  }, []);

  const saveTheme = useCallback(async (theme: CustomTheme) => {
    const toSave: CustomTheme = {
      ...theme,
      id: theme.id.startsWith('built-in-') ? `custom-${Date.now()}` : theme.id,
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    };
    setCustomThemes((prev) => {
      const exists = prev.find((t) => t.id === toSave.id);
      if (exists) {
        return prev.map((t) => (t.id === toSave.id ? toSave : t));
      }
      return [...prev, toSave];
    });
    setEditingTheme(toSave);

    // Also persist to server
    try {
      const res = await fetch('/api/settings/theme-builder', {
        method: toSave.id.startsWith('custom-') && customThemes.some((t) => t.id === toSave.id) ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (!res.ok) {
        console.warn('Failed to save theme to server');
      }
    } catch {
      // Server unavailable, localStorage will persist
    }
  }, [customThemes]);

  const deleteTheme = useCallback(
    async (id: string) => {
      const theme = customThemes.find((t) => t.id === id);
      if (theme?.isBuiltIn) return;
      setCustomThemes((prev) => prev.filter((t) => t.id !== id));
      if (editingTheme?.id === id) {
        resetEditingTheme();
      }

      // Also delete from server
      try {
        const res = await fetch(`/api/settings/theme-builder/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          console.warn('Failed to delete theme from server');
        }
      } catch {
        // Server unavailable, localStorage will persist
      }
    },
    [customThemes, editingTheme, resetEditingTheme],
  );

  const togglePreview = useCallback(() => {
    setPreviewMode((prev) => !prev);
  }, []);

  const createFromPreset = useCallback(
    (baseThemeId: string, overrides: Partial<CustomTheme>): CustomTheme => {
      const base = builtInThemes.find((t) => t.id === baseThemeId) || customThemes.find((t) => t.id === baseThemeId);
      if (!base) throw new Error(`Base theme not found: ${baseThemeId}`);

      const now = new Date().toISOString();
      const newTheme: CustomTheme = {
        ...base,
        id: `custom-${Date.now()}`,
        name: overrides.name || `${base.name} (Custom)`,
        description: overrides.description || `Customized from ${base.name}`,
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
        tokens: { ...base.tokens, ...overrides.tokens },
        lightTokens: { ...base.lightTokens, ...overrides.lightTokens },
        darkTokens: { ...base.darkTokens, ...overrides.darkTokens },
        profile: { ...base.profile, ...overrides.profile },
        tuiPalette: overrides.tuiPalette,
      };
      return newTheme;
    },
    [builtInThemes, customThemes],
  );

  const applyThemeToPreview = useCallback((theme: CustomTheme) => {
    const root = document.documentElement;
    for (const [cssVar, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(cssVar, value);
    }
    const resolved = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    if (resolved === 'light' && theme.lightTokens) {
      for (const [cssVar, value] of Object.entries(theme.lightTokens)) {
        root.style.setProperty(cssVar, value);
      }
    } else if (resolved === 'dark' && theme.darkTokens) {
      for (const [cssVar, value] of Object.entries(theme.darkTokens)) {
        root.style.setProperty(cssVar, value);
      }
    }
    if (theme.profile) {
      applySettings({ ...DEFAULT_SETTINGS, ...theme.profile } as ThemeSettings, resolved);
    }
  }, []);

  const value = useMemo<ThemeBuilderContextValue>(
    () => ({
      editingTheme,
      previewMode,
      customThemes,
      builtInThemes,
      updateToken,
      resetToken,
      loadTheme,
      saveTheme,
      deleteTheme,
      togglePreview,
      createFromPreset,
      resetEditingTheme,
      applyThemeToPreview,
      getTokenByCssVar,
      getTokensByCategory,
      hydrateFromServer,
    }),
    [
      editingTheme,
      previewMode,
      customThemes,
      builtInThemes,
      updateToken,
      resetToken,
      loadTheme,
      saveTheme,
      deleteTheme,
      togglePreview,
      createFromPreset,
      resetEditingTheme,
      applyThemeToPreview,
      getTokenByCssVar,
      getTokensByCategory,
      hydrateFromServer,
    ],
  );

  return <ThemeBuilderContext.Provider value={value}>{children}</ThemeBuilderContext.Provider>;
}

export function useThemeBuilder(): ThemeBuilderContextValue {
  const ctx = useContext(ThemeBuilderContext);
  if (!ctx) throw new Error('useThemeBuilder requires ThemeBuilderProvider');
  return ctx;
}
