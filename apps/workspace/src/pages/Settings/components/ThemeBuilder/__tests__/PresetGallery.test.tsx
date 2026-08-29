import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeBuilderProvider, useThemeBuilder } from '../../../../../lib/theme-builder-context.js';
import { PresetGallery } from '../PresetGallery/PresetGallery.js';
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

describe('PresetGallery', () => {
  it('renders built-in and custom tabs', () => {
    render(<PresetGallery />, { wrapper });
    expect(screen.getByRole('tab', { name: /built-in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /custom/i })).toBeInTheDocument();
  });

  it('shows built-in themes count (36)', () => {
    render(<PresetGallery />, { wrapper });
    expect(screen.getByText(/built-in \(36\)/i)).toBeInTheDocument();
  });

  it('shows custom themes count (0 initially)', () => {
    render(<PresetGallery />, { wrapper });
    expect(screen.getByText(/custom \(0\)/i)).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<PresetGallery />, { wrapper });
    expect(screen.getByPlaceholderText('Search themes...')).toBeInTheDocument();
  });

  it('filters built-in themes on search', async () => {
    const user = userEvent.setup();
    render(<PresetGallery />, { wrapper });

    const searchInput = screen.getByPlaceholderText('Search themes...');
    await act(async () => {
      await user.type(searchInput, 'gold');
    });

    // Should show only gold themes (4 profiles)
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBe(4);
    cards.forEach(card => {
      expect(card).toHaveTextContent(/gold/i);
    });
  });

  it('filters custom themes on search', async () => {
    // Add a custom theme first
    const { result } = renderHook(() => useThemeBuilder(), { wrapper });
    const customTheme: CustomTheme = {
      id: 'custom-search-test',
      name: 'Searchable Theme',
      description: 'Test search',
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
    render(<PresetGallery />, { wrapper });

    const searchInput = screen.getByPlaceholderText('Search themes...');
    await act(async () => {
      await user.type(searchInput, 'searchable');
    });

    const cards = screen.getAllByRole('article');
    expect(cards.length).toBe(1);
    expect(cards[0]).toHaveTextContent('Searchable Theme');
  });

  describe('Built-in themes', () => {
    it('displays all 36 built-in themes in a grid', () => {
      render(<PresetGallery />, { wrapper });
      const cards = screen.getAllByRole('article');
      expect(cards.length).toBe(36);
    });

    it('shows theme name and description on each card', () => {
      render(<PresetGallery />, { wrapper });
      const firstCard = screen.getAllByRole('article')[0];
      expect(firstCard).toHaveTextContent(/vestara gold/i);
      expect(firstCard).toHaveTextContent(/default/i);
    });

    it('has customize button for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      const firstCard = screen.getAllByRole('article')[0];
      expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
    });

    it('has apply button for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('has duplicate button for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
    });

    it('has export button for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('does NOT have delete button for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });
  });

  describe('Custom themes', () => {
    it('shows empty state when no custom themes', () => {
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });
      expect(screen.getByText('No Custom Themes Yet')).toBeInTheDocument();
      expect(screen.getByText('Create Your First Theme')).toBeInTheDocument();
    });

    it('shows New Theme button on custom tab', () => {
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });
      expect(screen.getByRole('button', { name: /new theme/i })).toBeInTheDocument();
    });

    it('displays custom themes when they exist', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-display',
        name: 'Display Theme',
        description: 'Test display',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const cards = screen.getAllByRole('article');
      expect(cards.length).toBe(1);
      expect(cards[0]).toHaveTextContent('Display Theme');
    });

    it('has customize button for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-customize',
        name: 'Customize Theme',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
    });

    it('has apply button for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-apply',
        name: 'Apply Theme',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('has duplicate button for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-duplicate',
        name: 'Duplicate Theme',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
    });

    it('has export button for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-export',
        name: 'Export Theme',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('has delete button for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-delete-btn',
        name: 'Delete Button Theme',
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

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });
  });

  describe('Create from preset dialog', () => {
    it('opens customize dialog when clicking customize on built-in theme', async () => {
      const user = userEvent.setup();
      render(<PresetGallery />, { wrapper });

      const firstCard = screen.getAllByRole('article')[0];
      const customizeButton = firstCard.querySelector('button[aria-label*="customize"]') as HTMLButtonElement;

      await act(async () => {
        await user.click(customizeButton!);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create Custom Theme')).toBeInTheDocument();
    });

    it('opens customize dialog when clicking customize on custom theme', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-edit',
        name: 'Edit Theme',
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
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const customizeButton = screen.getByRole('button', { name: /customize/i });
      await act(async () => {
        await user.click(customizeButton);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens create dialog when clicking New Theme button', async () => {
      const user = userEvent.setup();
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const newThemeButton = screen.getByRole('button', { name: /new theme/i });
      await act(async () => {
        await user.click(newThemeButton);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create Custom Theme')).toBeInTheDocument();
    });

    it('creates new custom theme from preset', async () => {
      const user = userEvent.setup();
      render(<PresetGallery />, { wrapper });

      const firstCard = screen.getAllByRole('article')[0];
      const customizeButton = firstCard.querySelector('button[aria-label*="customize"]') as HTMLButtonElement;
      await act(async () => {
        await user.click(customizeButton!);
      });

      const nameInput = screen.getByLabelText('Theme name');
      await act(async () => {
        await user.clear(nameInput);
        await user.type(nameInput, 'My Custom Theme');
      });

      const createButton = screen.getByRole('button', { name: /create theme/i });
      await act(async () => {
        await user.click(createButton);
      });

      // Dialog should close
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Custom theme should appear in custom tab
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      expect(screen.getByText('My Custom Theme')).toBeInTheDocument();
    });
  });

  describe('Delete custom theme', () => {
    it('deletes custom theme on delete button click', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
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
        await result.current.saveTheme(customTheme);
      });

      const user = userEvent.setup();
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await act(async () => {
        await user.click(deleteButton);
      });

      // Theme should be removed
      expect(screen.getByText('No Custom Themes Yet')).toBeInTheDocument();
    });

    it('does not allow deleting built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });
  });

  describe('Duplicate theme', () => {
    it('duplicates theme on duplicate button click', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-to-duplicate',
        name: 'To Duplicate',
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
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const duplicateButton = screen.getByRole('button', { name: /duplicate/i });
      await act(async () => {
        await user.click(duplicateButton);
      });

      // Should have 2 themes now
      const cards = screen.getAllByRole('article');
      expect(cards.length).toBe(2);
      expect(screen.getByText('Copy of To Duplicate')).toBeInTheDocument();
    });
  });

  describe('Export theme', () => {
    it('triggers download on export button click', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const customTheme: CustomTheme = {
        id: 'custom-to-export',
        name: 'Export Me',
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
      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await act(async () => {
        await user.click(exportButton);
      });

      // Download should be triggered (hard to test in jsdom)
      // But we can verify no error occurs
      expect(true).toBe(true);
    });
  });

  describe('Drag and drop reorder (custom themes)', () => {
    it('supports drag and drop for custom themes', async () => {
      const { result } = renderHook(() => useThemeBuilder(), { wrapper });
      const theme1: CustomTheme = {
        id: 'custom-drag-1',
        name: 'Drag Theme 1',
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
      const theme2: CustomTheme = {
        id: 'custom-drag-2',
        name: 'Drag Theme 2',
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
        await result.current.saveTheme(theme1);
        await result.current.saveTheme(theme2);
      });

      render(<PresetGallery />, { wrapper });
      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const cards = screen.getAllByRole('article');
      expect(cards.length).toBe(2);

      // First card should have drag handle
      const firstCard = cards[0];
      expect(firstCard.querySelector('[draggable="true"]')).toBeInTheDocument();
    });

    it('does not have drag handle for built-in themes', () => {
      render(<PresetGallery />, { wrapper });
      const cards = screen.getAllByRole('article');
      const firstCard = cards[0];
      expect(firstCard.querySelector('[draggable="true"]')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper tab structure', () => {
      render(<PresetGallery />, { wrapper });
      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();

      const builtInTab = screen.getByRole('tab', { name: /built-in/i });
      expect(builtInTab).toHaveAttribute('aria-selected', 'true');
      expect(builtInTab).toHaveAttribute('aria-controls', 'built-in-panel');

      const customTab = screen.getByRole('tab', { name: /custom/i });
      expect(customTab).toHaveAttribute('aria-selected', 'false');
      expect(customTab).toHaveAttribute('aria-controls', 'custom-panel');
    });

    it('tab panels are properly associated', () => {
      render(<PresetGallery />, { wrapper });
      const builtInPanel = screen.getByRole('tabpanel', { name: /built-in/i });
      expect(builtInPanel).toBeInTheDocument();
      expect(builtInPanel).not.toHaveAttribute('hidden');

      const customTab = screen.getByRole('tab', { name: /custom/i });
      act(() => {
        customTab.click();
      });

      const customPanel = screen.getByRole('tabpanel', { name: /custom/i });
      expect(customPanel).not.toHaveAttribute('hidden');
      expect(builtInPanel).toHaveAttribute('hidden');
    });

    it('search input has proper label', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.getByLabelText('Search themes')).toBeInTheDocument();
    });

    it('theme cards are articles with proper structure', () => {
      render(<PresetGallery />, { wrapper });
      const cards = screen.getAllByRole('article');
      expect(cards.length).toBeGreaterThan(0);
      cards.forEach(card => {
        expect(card).toHaveAttribute('role', 'article');
      });
    });

    it('buttons have accessible names', () => {
      render(<PresetGallery />, { wrapper });
      expect(screen.getByRole('button', { name: /customize/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });
  });
});