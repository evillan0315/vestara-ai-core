import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider, useThemeBuilder } from '../../../../../lib/theme-builder-context.js';
import { ImportExport } from '../ImportExport/ImportExport.js';
import type { CustomTheme } from '../../../../../lib/theme.js';

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

describe('ImportExport', () => {
  it('renders three tabs: Import, Export, Share', () => {
    render(<ImportExport />, { wrapper });
    expect(screen.getByRole('tab', { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /share/i })).toBeInTheDocument();
  });

  it('shows import panel by default', () => {
    render(<ImportExport />, { wrapper });
    expect(screen.getByText('Import Themes')).toBeInTheDocument();
    expect(screen.getByText('Open Import Dialog')).toBeInTheDocument();
  });

  it('switches to export panel on tab click', () => {
    render(<ImportExport />, { wrapper });
    const exportTab = screen.getByRole('tab', { name: /export/i });
    act(() => {
      exportTab.click();
    });
    expect(screen.getByText('Export Themes')).toBeInTheDocument();
    expect(screen.getByText('Open Export Dialog')).toBeInTheDocument();
  });

  it('switches to share panel on tab click', () => {
    render(<ImportExport />, { wrapper });
    const shareTab = screen.getByRole('tab', { name: /share/i });
    act(() => {
      shareTab.click();
    });
    expect(screen.getByText('Share Theme')).toBeInTheDocument();
    expect(screen.getByText('Open Share Dialog')).toBeInTheDocument();
  });

  describe('ImportDialog', () => {
    it('opens import dialog on button click', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Import Themes')).toBeInTheDocument();
    });

    it('has file input for JSON files', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });
      expect(screen.getByLabelText('Select .vestara-theme.json file')).toBeInTheDocument();
    });

    it('has paste JSON textarea', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });
      expect(screen.getByLabelText('Paste theme JSON')).toBeInTheDocument();
    });

    it('has merge strategy selector', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });
      expect(screen.getByLabelText('Merge strategy')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /add new/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /update existing/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /replace all/i })).toBeInTheDocument();
    });

    it('validates JSON on paste', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const pasteArea = screen.getByLabelText('Paste theme JSON');
      await act(async () => {
        await user.type(pasteArea, '{ invalid json }');
      });

      // Should show validation error
      expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
    });

    it('accepts valid single theme JSON', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const validTheme = JSON.stringify({
        id: 'custom-imported',
        name: 'Imported Theme',
        description: 'Imported from JSON',
        isBuiltIn: false,
        baseThemeId: 'gold',
        tokens: { '--vestara-accent': '#ff0000' },
        lightTokens: {},
        darkTokens: {},
        profile: { colorTheme: 'gold' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const pasteArea = screen.getByLabelText('Paste theme JSON');
      await act(async () => {
        await user.clear(pasteArea);
        await user.type(pasteArea, validTheme);
      });

      // Should show valid theme preview
      expect(screen.getByText('Imported Theme')).toBeInTheDocument();
    });

    it('accepts valid theme array JSON', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const validThemes = JSON.stringify([
        {
          id: 'custom-imported-1',
          name: 'Imported Theme 1',
          description: 'Imported from JSON',
          isBuiltIn: false,
          baseThemeId: 'gold',
          tokens: { '--vestara-accent': '#ff0000' },
          lightTokens: {},
          darkTokens: {},
          profile: { colorTheme: 'gold' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'custom-imported-2',
          name: 'Imported Theme 2',
          description: 'Imported from JSON',
          isBuiltIn: false,
          baseThemeId: 'blue',
          tokens: { '--vestara-accent': '#3b82f6' },
          lightTokens: {},
          darkTokens: {},
          profile: { colorTheme: 'blue' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const pasteArea = screen.getByLabelText('Paste theme JSON');
      await act(async () => {
        await user.clear(pasteArea);
        await user.type(pasteArea, validThemes);
      });

      // Should show both themes
      expect(screen.getByText('Imported Theme 1')).toBeInTheDocument();
      expect(screen.getByText('Imported Theme 2')).toBeInTheDocument();
    });

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await act(async () => {
        await user.click(cancelButton);
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('ExportDialog', () => {
    it('opens export dialog on button click', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Export Themes')).toBeInTheDocument();
    });

    it('shows list of custom themes to export', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-export-1',
        name: 'Export Theme 1',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByText('Export Theme 1')).toBeInTheDocument();
    });

    it('has export all button', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByRole('button', { name: /export all/i })).toBeInTheDocument();
    });

    it('has copy JSON button', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-copy-json',
        name: 'Copy JSON Theme',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByRole('button', { name: /copy json/i })).toBeInTheDocument();
    });

    it('has copy Base64 button', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-copy-b64',
        name: 'Copy B64 Theme',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByRole('button', { name: /copy base64/i })).toBeInTheDocument();
    });
  });

  describe('ShareDialog', () => {
    it('opens share dialog on button click', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const shareTab = screen.getByRole('tab', { name: /share/i });
      act(() => {
        shareTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open share dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Share Theme')).toBeInTheDocument();
    });

    it('shows theme selector', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-share-1',
        name: 'Share Theme 1',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const shareTab = screen.getByRole('tab', { name: /share/i });
      act(() => {
        shareTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open share dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByLabelText('Select theme to share')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Share Theme 1' })).toBeInTheDocument();
    });

    it('generates share URL with base64 encoded theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-share-url',
        name: 'Share URL Theme',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const shareTab = screen.getByRole('tab', { name: /share/i });
      act(() => {
        shareTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open share dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const themeSelect = screen.getByLabelText('Select theme to share');
      await act(async () => {
        await user.selectOptions(themeSelect, 'custom-share-url');
      });

      // Should show generated URL
      expect(screen.getByText(/share.*url/i)).toBeInTheDocument();
    });

    it('has copy URL button', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-copy-url',
        name: 'Copy URL Theme',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const shareTab = screen.getByRole('tab', { name: /share/i });
      act(() => {
        shareTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open share dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const themeSelect = screen.getByLabelText('Select theme to share');
      await act(async () => {
        await user.selectOptions(themeSelect, 'custom-copy-url');
      });

      expect(screen.getByRole('button', { name: /copy url/i })).toBeInTheDocument();
    });

    it('shows QR code option', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-qr',
        name: 'QR Theme',
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

      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const shareTab = screen.getByRole('tab', { name: /share/i });
      act(() => {
        shareTab.click();
      });

      const openButton = screen.getByRole('button', { name: /open share dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const themeSelect = screen.getByLabelText('Select theme to share');
      await act(async () => {
        await user.selectOptions(themeSelect, 'custom-qr');
      });

      expect(screen.getByText(/qr code/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper tab structure', () => {
      render(<ImportExport />, { wrapper });
      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();

      const importTab = screen.getByRole('tab', { name: /import/i });
      expect(importTab).toHaveAttribute('aria-selected', 'true');
      expect(importTab).toHaveAttribute('aria-controls', 'import-panel');
    });

    it('tab panels are properly associated', () => {
      render(<ImportExport />, { wrapper });
      const importPanel = screen.getByRole('tabpanel', { name: /import/i });
      expect(importPanel).not.toHaveAttribute('hidden');

      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const exportPanel = screen.getByRole('tabpanel', { name: /export/i });
      expect(exportPanel).not.toHaveAttribute('hidden');
      expect(importPanel).toHaveAttribute('hidden');
    });

    it('dialogs have proper labels', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('form inputs have proper labels', async () => {
      const user = userEvent.setup();
      render(<ImportExport />, { wrapper });
      const openButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openButton);
      });

      expect(screen.getByLabelText('Select .vestara-theme.json file')).toBeInTheDocument();
      expect(screen.getByLabelText('Paste theme JSON')).toBeInTheDocument();
      expect(screen.getByLabelText('Merge strategy')).toBeInTheDocument();
    });
  });
});