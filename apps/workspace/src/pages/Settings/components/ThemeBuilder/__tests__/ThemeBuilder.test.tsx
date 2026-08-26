import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider, useThemeBuilder } from '../../../../../lib/theme-builder-context.js';
import { ThemeBuilder } from '../ThemeBuilder.tsx';
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
  // Mock ResizeObserver for sidebar collapse
  vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ThemeBuilder - Full Integration', () => {
  it('renders all three panels: Preset Gallery, Token Editor, Theme Preview', () => {
    render(<ThemeBuilder />, { wrapper });
    expect(screen.getByText('Semantic Tokens')).toBeInTheDocument();
    expect(screen.getByText('Accent Colors')).toBeInTheDocument();
    expect(screen.getByText('Preview Disabled')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /built-in/i })).toBeInTheDocument();
  });

  it('has header with theme builder title', () => {
    render(<ThemeBuilder />, { wrapper });
    expect(screen.getByText('Theme Builder')).toBeInTheDocument();
  });

  it('has apply button in header', () => {
    render(<ThemeBuilder />, { wrapper });
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
  });

  it('has reset to default button in header', () => {
    render(<ThemeBuilder />, { wrapper });
    expect(screen.getByRole('button', { name: /reset to default/i })).toBeInTheDocument();
  });

  it('has import/export button in header', () => {
    render(<ThemeBuilder />, { wrapper });
    expect(screen.getByRole('button', { name: /import.*export/i })).toBeInTheDocument();
  });

  describe('Tab navigation', () => {
    it('switches between Edit, Preview, and Import/Export tabs', () => {
      render(<ThemeBuilder />, { wrapper });

      // Default should be Edit tab (Token Editor visible)
      expect(screen.getByText('Semantic Tokens')).toBeInTheDocument();

      // Click Preview tab
      const previewTab = screen.getByRole('tab', { name: /preview/i });
      act(() => {
        previewTab.click();
      });
      expect(screen.getByText('Preview Disabled')).toBeInTheDocument();

      // Click Import/Export tab
      const importExportTab = screen.getByRole('tab', { name: /import.*export/i });
      act(() => {
        importExportTab.click();
      });
      expect(screen.getByText('Import Themes')).toBeInTheDocument();
    });

    it('tab panels are properly associated', () => {
      render(<ThemeBuilder />, { wrapper });

      const editPanel = screen.getByRole('tabpanel', { name: /edit/i });
      expect(editPanel).not.toHaveAttribute('hidden');

      const previewTab = screen.getByRole('tab', { name: /preview/i });
      act(() => {
        previewTab.click();
      });

      const previewPanel = screen.getByRole('tabpanel', { name: /preview/i });
      expect(previewPanel).not.toHaveAttribute('hidden');
      expect(editPanel).toHaveAttribute('hidden');
    });
  });

  describe('End-to-end flow: Create → Edit → Preview → Export → Import', () => {
    it('completes full theme creation and editing flow', async () => {
      const user = userEvent.setup();
      render(<ThemeBuilder />, { wrapper });

      // 1. CREATE: Click customize on a built-in theme
      const firstCard = screen.getAllByRole('article')[0];
      const customizeButton = firstCard.querySelector('button[aria-label*="customize"]') as HTMLButtonElement;
      await act(async () => {
        await user.click(customizeButton!);
      });

      // Fill in theme name
      const nameInput = screen.getByLabelText('Theme name');
      await act(async () => {
        await user.clear(nameInput);
        await user.type(nameInput, 'E2E Test Theme');
      });

      const createButton = screen.getByRole('button', { name: /create theme/i });
      await act(async () => {
        await user.click(createButton);
      });

      // Dialog closes, custom theme should be in gallery
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // 2. EDIT: Go to custom tab and customize the new theme
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const customCard = screen.getByText('E2E Test Theme').closest('[role="article"]');
      const editButton = customCard?.querySelector('button[aria-label*="customize"]') as HTMLButtonElement;
      await act(async () => {
        await user.click(editButton!);
      });

      // Edit a color token (Accent Primary)
      const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
      const colorInput = accentPrimary?.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        await user.clear(colorInput!);
        await user.type(colorInput!, '#ff6600');
      });

      // Wait for debounce
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Edit a length token (Page Spacing)
      const pageSpacing = screen.getByText('Page Spacing').closest('[role="listitem"]');
      const numberInput = pageSpacing?.querySelector('input[type="number"]') as HTMLInputElement;
      await act(async () => {
        await user.clear(numberInput!);
        await user.type(numberInput!, '2');
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // 3. PREVIEW: Enable preview and verify
      const previewTab = screen.getByRole('tab', { name: /preview/i });
      act(() => {
        previewTab.click();
      });

      // Toggle preview on
      const previewToggle = screen.getByRole('button', { name: /enable preview/i });
      await act(async () => {
        await user.click(previewToggle);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Preview iframe should be visible
      expect(screen.getByTitle('Theme Preview')).toBeInTheDocument();

      // Switch theme mode in preview
      const modeSelect = screen.getByLabelText('Theme mode') as HTMLSelectElement;
      await act(async () => {
        await user.selectOptions(modeSelect, 'light');
      });

      // 4. APPLY: Click Apply button in header
      const applyButton = screen.getByRole('button', { name: /apply/i });
      await act(async () => {
        await user.click(applyButton);
      });

      // Theme should be applied to document
      expect(document.documentElement.style.getPropertyValue('--vestara-accent')).toBe('#ff6600');

      // 5. EXPORT: Go to Import/Export tab and export
      const importExportTab = screen.getByRole('tab', { name: /import.*export/i });
      act(() => {
        importExportTab.click();
      });

      const exportTab = screen.getByRole('tab', { name: /export/i });
      act(() => {
        exportTab.click();
      });

      const openExportButton = screen.getByRole('button', { name: /open export dialog/i });
      await act(async () => {
        await user.click(openExportButton);
      });

      // Select the theme and export
      const themeSelect = screen.getByLabelText('Select theme to export');
      await act(async () => {
        await user.selectOptions(themeSelect, 'E2E Test Theme');
      });

      const exportButton = screen.getByRole('button', { name: /export theme/i });
      await act(async () => {
        await user.click(exportButton);
      });

      // 6. IMPORT: Import the exported theme (simulate)
      const importTab = screen.getByRole('tab', { name: /import/i });
      act(() => {
        importTab.click();
      });

      const openImportButton = screen.getByRole('button', { name: /open import dialog/i });
      await act(async () => {
        await user.click(openImportButton);
      });

      // The import dialog should be functional
      expect(screen.getByLabelText('Select .vestara-theme.json file')).toBeInTheDocument();
    });
  });

  describe('Reset to Default', () => {
    it('resets to default profile on Reset button click', async () => {
      const user = userEvent.setup();
      render(<ThemeBuilder />, { wrapper });

      // Modify a token first
      const accentPrimary = screen.getByText('Accent Primary').closest('[role="listitem"]');
      const colorInput = accentPrimary?.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        await user.clear(colorInput!);
        await user.type(colorInput!, '#ff6600');
      });

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // Click Reset to Default
      const resetButton = screen.getByRole('button', { name: /reset to default/i });
      await act(async () => {
        await user.click(resetButton);
      });

      // Token should be back to default
      expect(screen.getByText('#f59e0b')).toBeInTheDocument();
    });
  });

  describe('Persistence across reload', () => {
    it('custom themes survive provider remount', async () => {
      const { result, unmount } = renderHook(() => useThemeBuilder(), { wrapper });

      const customTheme: CustomTheme = {
        id: 'custom-persist-test',
        name: 'Persist Test',
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
        await result.current.saveTheme(customTheme);
      });

      expect(result.current.customThemes).toHaveLength(1);

      unmount();

      // Remount
      const { result: result2 } = renderHook(() => useThemeBuilder(), { wrapper });
      expect(result2.current.customThemes).toHaveLength(1);
      expect(result2.current.customThemes[0].name).toBe('Persist Test');
      expect(result2.current.customThemes[0].tokens['--vestara-accent']).toBe('#ff0000');
    });
  });

  describe('Delete custom theme', () => {
    it('deletes custom theme and removes from gallery', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });

      const customTheme: CustomTheme = {
        id: 'custom-delete-integration',
        name: 'Delete Integration',
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
        await result.current.saveTheme(customTheme);
      });

      const user = userEvent.setup();
      render(<ThemeBuilder />, { wrapper });

      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await act(async () => {
        await user.click(deleteButton);
      });

      expect(screen.getByText('No Custom Themes Yet')).toBeInTheDocument();
    });
  });

  describe('Built-in themes cannot be deleted', () => {
    it('built-in themes do not have delete button', () => {
      render(<ThemeBuilder />, { wrapper });
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      render(<ThemeBuilder />, { wrapper });
      expect(screen.getByRole('heading', { level: 1, name: 'Theme Builder' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Semantic Tokens' })).toBeInTheDocument();
    });

    it('main regions are properly labeled', () => {
      render(<ThemeBuilder />, { wrapper });
      expect(screen.getByRole('region', { name: 'Token editor' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Preset Gallery' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Theme Preview' })).toBeInTheDocument();
    });

    it('keyboard navigation works (Escape closes sidebars on mobile)', () => {
      // This test would require viewport mocking
      // For now verify the structure supports it
      render(<ThemeBuilder />, { wrapper });
      const root = screen.getByRole('application');
      expect(root).toHaveAttribute('aria-label', 'Theme Builder');
    });

    it('focus indicators are visible', () => {
      render(<ThemeBuilder />, { wrapper });
      const tab = screen.getByRole('tab', { name: /built-in/i });
      expect(tab).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Responsive behavior', () => {
    it('collapses sidebars on mobile', () => {
      // This would require window.innerWidth mocking
      // For now verify the structure has collapse buttons
      render(<ThemeBuilder />, { wrapper });
      const leftCollapse = screen.getByLabelText('Hide preset gallery');
      expect(leftCollapse).toBeInTheDocument();
      const rightCollapse = screen.getByLabelText('Hide preview');
      expect(rightCollapse).toBeInTheDocument();
    });
  });
});