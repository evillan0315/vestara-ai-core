/** @vitest-environment jsdom */
/**
 * VES-UI-001 T1: DesktopTopBar guards.
 *
 * Locks the 32px global chrome contract:
 * - `h-8` header with a 20px inline `VestaraMark` (never `<img>`).
 * - Spotlight trigger dispatches `open-command-palette` (bare `⌘K` is
 *   owned globally by `CommandPalette`).
 * - Clock renders `HH:MM` + accent seconds + date; status icons, compact
 *   connection indicator, notifications, theme toggle, and compact avatar
 *   are all present and keyboard-reachable.
 * - Version pill renders only when `version` is passed (G11: no skew).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../lib/auth';
import { ThemeProvider } from '../../../lib/theme';
import DesktopTopBar, { formatTopBarClock } from './DesktopTopBar';
import type { ReactNode } from 'react';

function stubMatchMedia() {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
}

function renderTopBar(props: { version?: string } = {}) {
  stubMatchMedia();
  const shell = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );
  return render(<DesktopTopBar onMenuClick={vi.fn()} {...props} />, { wrapper: shell });
}

describe('formatTopBarClock', () => {
  it('splits HH:MM, seconds, and a pinned en-US date', () => {
    const clock = formatTopBarClock(new Date(2026, 9, 20, 9, 5, 7));
    expect(clock.head).toBe('09:05');
    expect(clock.seconds).toBe('07');
    expect(clock.date).toBe('Oct 20');
  });
});

describe('DesktopTopBar', () => {
  it('renders 32px chrome with a 20px inline Vestara mark', () => {
    const { container } = renderTopBar({ version: 'v1.0.0' });
    const header = container.querySelector('header.shell-topbar');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('h-8');
    expect(header?.querySelector('header.h-16')).toBeNull();

    const mark = header?.querySelector('svg[aria-label="Vestara"]');
    expect(mark).toBeInTheDocument();
    expect(mark?.getAttribute('width')).toBe('20');
    expect(mark?.getAttribute('height')).toBe('20');
    expect(header?.querySelector('img[alt="Vestara"]')).toBeNull();

    expect(screen.getByText('VESTARA')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('omits the version pill when no version is passed (G11)', () => {
    const { container } = renderTopBar();
    expect(container.querySelector('header.shell-topbar')).toBeInTheDocument();
    expect(screen.queryByText(/v\d+\.\d+/)).toBeNull();
  });

  it('dispatches open-command-palette from the Spotlight trigger', async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    renderTopBar();
    const trigger = screen.getByRole('button', { name: 'Search pages, agents, and projects' });
    expect(trigger).toHaveTextContent('Spotlight');
    expect(trigger).toHaveTextContent('⌘K');
    await user.click(trigger);
    expect(dispatch).toHaveBeenCalledWith(expect.any(CustomEvent));
    const event = dispatch.mock.calls.map((call) => call[0]).find((e) => e instanceof CustomEvent) as
      | CustomEvent
      | undefined;
    expect(event?.type).toBe('open-command-palette');
    dispatch.mockRestore();
  });

  it('shows the clock, status indicators, and compact session controls', () => {
    renderTopBar();
    expect(screen.getByRole('status', { name: /Current time \d{2}:\d{2}:\d{2}/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Network status' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Power status' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /Workspace connection/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Account: / })).toBeInTheDocument();
  });

  it('keeps every top-bar control keyboard-reachable', async () => {
    const user = userEvent.setup();
    renderTopBar();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toBeVisible();
    }
    await user.tab();
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });
});
