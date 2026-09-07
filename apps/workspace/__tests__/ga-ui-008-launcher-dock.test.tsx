/**
 * GA-UI-008 — Launcher conversation dock.
 *
 * Covers the recent-conversations dock anchored to the floating launcher:
 * - Hidden while the panel is closed and not hovered; revealed on hover intent
 * - Lists recent conversations (capped) with the active one marked
 * - Selecting a conversation opens the assistant on it (GET-only — no new turn)
 * - Selecting the already-active conversation opens the panel without re-selection
 * - Escape closes the dock without touching the panel
 * - Pointer-leave closes the dock after the grace period
 * - Clicking the launcher still toggles the panel (dock hides)
 *
 * Presentation-only milestone — no authority changes.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const NOW = Date.now();
const CONVERSATIONS = [
  { id: 'conv-a', title: 'Explain the kernel', messageCount: 2, status: 'active', createdAt: new Date(NOW - 60_000).toISOString(), updatedAt: new Date(NOW - 60_000).toISOString() },
  { id: 'conv-b', title: 'Fix the launcher bug', messageCount: 4, status: 'active', createdAt: new Date(NOW - 3_600_000).toISOString(), updatedAt: new Date(NOW - 3_600_000).toISOString() },
  { id: 'conv-c', title: 'Refactor providers', messageCount: 1, status: 'active', createdAt: new Date(NOW - 86_400_000).toISOString(), updatedAt: new Date(NOW - 86_400_000).toISOString() },
];

async function mount() {
  const { GlobalAssistant } = await import('../src/components/assistant/GlobalAssistant');
  return render(
    <MemoryRouter>
      <GlobalAssistant />
    </MemoryRouter>,
  );
}

function openDock() {
  const launcher = screen.getByRole('button', { name: /open assistant/i });
  fireEvent.mouseEnter(launcher);
  return waitFor(() => expect(screen.getByTestId('launcher-dock')).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation(async (url: string, opts?: { method?: string }) => {
    const method = opts?.method ?? 'GET';
    if (url === '/api/conversations' && method === 'GET') {
      return { ok: true, json: async () => ({ conversations: CONVERSATIONS }) };
    }
    const match = url.match(/^\/api\/conversations\/([^/]+)$/);
    if (match && method === 'GET') {
      const id = match[1]!;
      return {
        ok: true,
        json: async () => ({
          conversation: { id, userId: 'local', title: CONVERSATIONS.find((c) => c.id === id)?.title ?? 'T', messages: [], status: 'active', createdAt: CONVERSATIONS[0]!.createdAt, updatedAt: CONVERSATIONS[0]!.updatedAt },
        }),
      };
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────

describe('LauncherDock (GA-UI-008)', () => {
  it('dock is hidden until the launcher is hovered, then lists recent conversations', async () => {
    await mount();
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
    await openDock();
    expect(screen.getByRole('button', { name: /open conversation: explain the kernel/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open conversation: fix the launcher bug/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open conversation: refactor providers/i })).toBeTruthy();
  });

  it('closes the dock when the pointer leaves (after the grace period)', async () => {
    await mount();
    await openDock();
    fireEvent.mouseLeave(screen.getByRole('button', { name: /open assistant/i }));
    await waitFor(() => expect(screen.queryByTestId('launcher-dock')).toBeNull());
  });

  it('selecting a dock conversation opens the assistant on it (GET-only, no new turn)', async () => {
    await mount();
    await openDock();
    const dock = screen.getByTestId('launcher-dock');
    fireEvent.click(within(dock).getByRole('button', { name: /open conversation: fix the launcher bug/i }));
    // Panel opens with the selected conversation.
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    // Canonical GET-only selection.
    await waitFor(() =>
      expect(mockFetch.mock.calls.some(([u]) => String(u) === '/api/conversations/conv-b')).toBe(true),
    );
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes('/stream'))).toHaveLength(0);
    // Dock is gone once the panel is open.
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
  });

  it('selecting the already-active conversation opens the panel without re-selection', async () => {
    await mount();
    // First selection from the dock.
    await openDock();
    fireEvent.click(within(screen.getByTestId('launcher-dock')).getByRole('button', { name: /open conversation: explain the kernel/i }));
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    await waitFor(() =>
      expect(mockFetch.mock.calls.filter(([u]) => String(u) === '/api/conversations/conv-a')).toHaveLength(1),
    );
    // Close the panel via the launcher (multiple "Close assistant" buttons
    // exist — panel close button too — so target the one with aria-expanded).
    await act(async () => {
      const launcher = screen
        .getAllByRole('button', { name: /close assistant/i })
        .find((b) => b.getAttribute('aria-expanded') !== null);
      launcher!.click();
    });
    await openDock();
    const dock = screen.getByTestId('launcher-dock');
    const active = within(dock).getByRole('button', { name: /open conversation: explain the kernel/i });
    expect(active.getAttribute('aria-current')).toBe('true');
    // Selecting the active conversation must not re-GET.
    fireEvent.click(active);
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    expect(mockFetch.mock.calls.filter(([u]) => String(u) === '/api/conversations/conv-a')).toHaveLength(1);
  });

  it('Escape closes the dock without opening the panel', async () => {
    await mount();
    await openDock();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('launcher-dock')).toBeNull());
    expect(screen.queryByLabelText('Global Assistant')).toBeNull();
  });

  it('clicking the launcher opens the panel and hides the dock', async () => {
    await mount();
    const launcher = screen.getByRole('button', { name: /open assistant/i });
    fireEvent.mouseEnter(launcher);
    await waitFor(() => expect(screen.getByTestId('launcher-dock')).toBeTruthy());
    await act(async () => {
      launcher.click();
    });
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
  });

  it('caps the dock at the six most recent conversations', async () => {
    mockFetch.mockImplementation(async (url: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (url === '/api/conversations' && method === 'GET') {
        const many = Array.from({ length: 8 }, (_, i) => ({
          id: `conv-${i}`,
          title: `Conversation ${i}`,
          messageCount: 0,
          status: 'active',
          createdAt: new Date(NOW - i * 60_000).toISOString(),
          updatedAt: new Date(NOW - i * 60_000).toISOString(),
        }));
        return { ok: true, json: async () => ({ conversations: many }) };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    await mount();
    await openDock();
    const dock = screen.getByTestId('launcher-dock');
    expect(within(dock).getAllByRole('button', { name: /open conversation:/i })).toHaveLength(6);
  });

  it('shows an empty-state hint when there are no conversations', async () => {
    mockFetch.mockImplementation(async (url: string, opts?: { method?: string }) => {
      const method = opts?.method ?? 'GET';
      if (url === '/api/conversations' && method === 'GET') {
        return { ok: true, json: async () => ({ conversations: [] }) };
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    });
    await mount();
    await openDock();
    expect(screen.getByTestId('launcher-dock-empty').textContent).toContain('No conversations yet');
  });

  // ── GA-UI-008 acceptance: ownership + side-effect bounds ──

  it('hovering the launcher never mutates state (no POST, no stream, no session)', async () => {
    await mount();
    await openDock();
    // Give any stray async side effect a beat to surface.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    const mutating = mockFetch.mock.calls.filter(
      ([u, o]) => String(u).includes('/stream') || (o?.method ?? 'GET') !== 'GET',
    );
    expect(mutating).toHaveLength(0);
  });

  // ── GA-UI-008 acceptance: keyboard accessibility ──

  it('dock is revealed from keyboard focus; entries are natively keyboard-reachable', async () => {
    await mount();
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
    const launcher = screen.getByRole('button', { name: /open assistant/i });
    fireEvent.focus(launcher);
    await waitFor(() => expect(screen.getByTestId('launcher-dock')).toBeTruthy());
    const entry = screen.getByRole('button', { name: /open conversation: explain the kernel/i });
    expect(entry.getAttribute('tabindex')).toBeNull();
    expect(entry.getAttribute('type')).toBe('button');
  });

  it('Escape closes a keyboard-revealed dock without opening the panel', async () => {
    await mount();
    fireEvent.focus(screen.getByRole('button', { name: /open assistant/i }));
    await waitFor(() => expect(screen.getByTestId('launcher-dock')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('launcher-dock')).toBeNull());
    expect(screen.queryByLabelText('Global Assistant')).toBeNull();
  });

  // ── GA-UI-008 acceptance: timer lifecycle ──

  it('opening the panel cancels a pending dock reveal (no stale reopen)', async () => {
    await mount();
    const launcher = screen.getByRole('button', { name: /open assistant/i });
    fireEvent.mouseEnter(launcher); // pending reveal (250ms)
    await act(async () => {
      launcher.click(); // panel opens; reveal must be cancelled
    });
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    // Outlive the 250ms reveal window — no stale reopen behind the panel.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
  });

  it('programmatic refocus after closing the panel does not reopen the dock', async () => {
    await mount();
    const launcher = screen.getByRole('button', { name: /open assistant/i });
    await act(async () => {
      launcher.click();
    });
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    await act(async () => {
      launcher.click(); // close panel → programmatic focus-return (suppressed)
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    expect(screen.queryByTestId('launcher-dock')).toBeNull();
  });

  // ── GA-UI-008 acceptance: canonical consistency ──

  it('aria-current marks exactly the active conversation in the dock', async () => {
    await mount();
    await openDock();
    fireEvent.click(
      within(screen.getByTestId('launcher-dock')).getByRole('button', {
        name: /open conversation: refactor providers/i,
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('Global Assistant')).toBeTruthy());
    await act(async () => {
      screen
        .getAllByRole('button', { name: /close assistant/i })
        .find((b) => b.getAttribute('aria-expanded') !== null)!
        .click();
    });
    await openDock();
    const dock = screen.getByTestId('launcher-dock');
    const marked = within(dock)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.getAttribute('aria-label')).toMatch(/refactor providers/i);
  });
});
