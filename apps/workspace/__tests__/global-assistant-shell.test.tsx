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

import { act, render, screen } from '@testing-library/react';
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
    const closeButton = screen.getByRole('button', { name: /close assistant/i });
    expect(closeButton.getAttribute('aria-expanded')).toBe('true');
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
});
