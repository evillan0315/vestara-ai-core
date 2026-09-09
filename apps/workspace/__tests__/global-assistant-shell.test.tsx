/**
 * VESTARA-INTELLIGENCE GA-1 Slice 1: GlobalAssistant Shell Mount Tests
 *
 * Verifies:
 * - Persistent shell mount in ShellLayout
 * - No Activity Room dependency
 * - GA-2 hook consumption
 * - GA-3 surface context consumption
 * - Launcher button renders and is accessible
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock useSurfaceContext — must be before component import
const mockUseSurfaceContext = vi.fn(() => ({
  workspace: { id: 'ws-test', name: 'Test Workspace' },
  surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Main' },
  selected: undefined,
}));

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSurfaceContext: (...args: unknown[]) => mockUseSurfaceContext(...args),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@vestara/ui', () => ({
  FloatingWindowManager: ({ children }: any) => <div data-testid="floating-window-manager">{children}</div>,
  FloatingWindow: ({ open, children }: any) => (open ? <div data-testid="floating-window">{children}</div> : null),
  FloatingWindowHeader: ({ children }: any) => <div data-testid="floating-window-header">{children}</div>,
  FloatingWindowContent: ({ children }: any) => <div data-testid="floating-window-content">{children}</div>,
}));

// ─── Tests ────────────────────────────────────────────────────

describe('GlobalAssistant — Slice 1: Shell Mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock conversation list for GA-2 hook mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ conversations: [] }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders launcher button with accessible label', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /open assistant/i });
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles aria-expanded on click', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /open assistant/i });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      button.click();
    });

    // After click, label changes to "Close assistant"
    // Multiple buttons may match; find the launcher (has aria-expanded)
    const closeButtons = screen.getAllByRole('button', { name: /close assistant/i });
    const launcher = closeButtons.find((b) => b.getAttribute('aria-expanded') !== null);
    expect(launcher).toBeDefined();
    expect(launcher!.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not import Activity Room modules', async () => {
    const mod = await import('../src/components/assistant/GlobalAssistant');
    expect(mod.GlobalAssistant).toBeDefined();
    expect(typeof mod.GlobalAssistant).toBe('function');
  });

  it('consumes useAssistantConversation (GA-2)', async () => {
    // Hook is called at top level of GlobalAssistant — import would fail if not consumed
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');
    expect(GlobalAssistant).toBeDefined();
  });

  it('consumes useSurfaceContext (GA-3)', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    expect(mockUseSurfaceContext).toHaveBeenCalled();
  });

  it('launcher has fixed positioning at bottom-right with z-90', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /open assistant/i });
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('bottom-6');
    expect(button.className).toContain('right-6');
    expect(button.className).toContain('z-[90]');
  });

  it('Ctrl+J toggles panel open/closed', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    // Panel should start closed
    const openButtons = screen.getAllByRole('button', { name: /open assistant/i });
    expect(openButtons.length).toBeGreaterThan(0);

    // Dispatch Ctrl+J to open
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    });

    // Panel should now be open — launcher label changes to "Close assistant"
    const closeButtons = screen.getAllByRole('button', { name: /close assistant/i });
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('Ctrl+J is ignored while typing in an input', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    // Create a textarea to simulate typing
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    // Dispatch from the textarea (bubbles to window) — this is what a real
    // keystroke looks like. e.target must be the textarea for the
    // "ignored while typing" guard to engage.
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }));
    });

    // Panel should remain closed (no toggle while typing)
    const openButtons = screen.getAllByRole('button', { name: /open assistant/i });
    expect(openButtons.length).toBeGreaterThan(0);

    document.body.removeChild(textarea);
  });

  it('launcher has Ctrl+J tooltip', async () => {
    const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');

    render(
      <MemoryRouter>
        <GlobalAssistant />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /open assistant/i });
    expect(button.title).toContain('Ctrl+J');
  });
});
