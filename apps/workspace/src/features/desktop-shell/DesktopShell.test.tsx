/**
 * VES-UI-001 T4: DesktopShell state-machine guards.
 *
 * - `desktopShellReducer` covers `boot → login → desktop` plus
 *   `locked / switch / shutdown` overlays; out-of-phase actions are no-ops.
 * - `systemMenuActionToShellAction` maps every `SystemMenu` id (`settings`
 *   is a window operation, not a phase — maps to `null`).
 * - `DesktopShell` renders `BootScreen` / `LoginScreen` versus the desktop
 *   children; a `locked` login keeps the session mounted (hidden).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../lib/auth';
import { BOOT_DONE_MS } from './BootScreen.js';
import {
  DesktopShell,
  desktopShellReducer,
  initialDesktopShellState,
  systemMenuActionToShellAction,
  type DesktopShellAction,
  type DesktopShellState,
} from './DesktopShell.js';

function renderShell(props: Partial<React.ComponentProps<typeof DesktopShell>> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  return render(
    <DesktopShell {...props}>
      <div data-testid="desktop-content">Desktop workspace</div>
    </DesktopShell>,
    { wrapper },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BOOT: DesktopShellState = { phase: 'boot', loginMode: 'default' };
const LOGIN: DesktopShellState = { phase: 'login', loginMode: 'default' };
const LOCKED: DesktopShellState = { phase: 'login', loginMode: 'locked' };
const DESKTOP: DesktopShellState = { phase: 'desktop', loginMode: 'default' };
const SHUTDOWN: DesktopShellState = { phase: 'shutdown', loginMode: 'default' };

describe('desktopShellReducer', () => {
  it('starts at boot in default mode', () => {
    expect(initialDesktopShellState).toEqual(BOOT);
  });

  it('advances boot → login → desktop', () => {
    const loggedOut = desktopShellReducer(BOOT, { type: 'boot-done' });
    expect(loggedOut).toEqual(LOGIN);
    const desktop = desktopShellReducer(loggedOut, { type: 'login-success' });
    expect(desktop.phase).toBe('desktop');
  });

  it('locks the desktop into a locked login and returns on success', () => {
    const locked = desktopShellReducer(DESKTOP, { type: 'lock' });
    expect(locked).toEqual(LOCKED);
    const back = desktopShellReducer(locked, { type: 'login-success' });
    expect(back.phase).toBe('desktop');
    expect(back.loginMode).toBe('locked');
  });

  it('switches users from desktop or login', () => {
    expect(desktopShellReducer(DESKTOP, { type: 'switch-user' })).toEqual({
      phase: 'login',
      loginMode: 'switch',
    });
    expect(desktopShellReducer(LOGIN, { type: 'switch-user' })).toEqual({
      phase: 'login',
      loginMode: 'switch',
    });
  });

  it('logs out from the desktop into a default login', () => {
    expect(desktopShellReducer(DESKTOP, { type: 'logout' })).toEqual(LOGIN);
  });

  it('shuts down from desktop or login and returns to a default login', () => {
    expect(desktopShellReducer(DESKTOP, { type: 'shutdown' }).phase).toBe('shutdown');
    expect(desktopShellReducer(LOGIN, { type: 'shutdown' }).phase).toBe('shutdown');
    expect(desktopShellReducer(SHUTDOWN, { type: 'shutdown-done' })).toEqual(LOGIN);
  });

  it('restarts from shutdown or login back to boot', () => {
    expect(desktopShellReducer(SHUTDOWN, { type: 'restart' })).toEqual(BOOT);
    expect(desktopShellReducer(LOCKED, { type: 'restart' })).toEqual(BOOT);
  });

  it('ignores out-of-phase actions (no-op returns the same state)', () => {
    const cases: Array<[DesktopShellState, DesktopShellAction]> = [
      [DESKTOP, { type: 'boot-done' }],
      [BOOT, { type: 'login-success' }],
      [LOGIN, { type: 'lock' }],
      [LOGIN, { type: 'logout' }],
      [BOOT, { type: 'switch-user' }],
      [SHUTDOWN, { type: 'switch-user' }],
      [BOOT, { type: 'shutdown' }],
      [SHUTDOWN, { type: 'shutdown' }],
      [DESKTOP, { type: 'shutdown-done' }],
      [BOOT, { type: 'shutdown-done' }],
      [DESKTOP, { type: 'restart' }],
      [BOOT, { type: 'restart' }],
    ];
    for (const [state, action] of cases) {
      expect(desktopShellReducer(state, action)).toBe(state);
    }
  });
});

describe('systemMenuActionToShellAction', () => {
  it('maps session actions onto reducer actions; settings is not a phase', () => {
    expect(systemMenuActionToShellAction('lockscreen')).toEqual({ type: 'lock' });
    expect(systemMenuActionToShellAction('switch')).toEqual({ type: 'switch-user' });
    expect(systemMenuActionToShellAction('logout')).toEqual({ type: 'logout' });
    expect(systemMenuActionToShellAction('shutdown')).toEqual({ type: 'shutdown' });
    expect(systemMenuActionToShellAction('settings')).toBeNull();
  });
});

describe('DesktopShell component', () => {
  it('boots, then shows the default login, then the desktop on submit', () => {
    renderShell();
    expect(screen.getByText('VESTARA')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-content')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(BOOT_DONE_MS);
    });
    expect(screen.getByText(/Welcome back,/)).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByText('VESTARA')).toBeNull();
  });

  it('renders the desktop directly when the initial phase is desktop', () => {
    renderShell({ initialPhase: 'desktop' });
    expect(screen.getByTestId('desktop-content')).toBeInTheDocument();
    expect(screen.queryByText('VESTARA')).toBeNull();
  });

  it('keeps the session mounted (hidden) behind a locked login', () => {
    renderShell({ initialPhase: 'login', initialLoginMode: 'locked' });
    expect(screen.getByText(/Locked,/)).toBeInTheDocument();
    const session = screen.getByTestId('desktop-shell-session');
    expect(session).toHaveAttribute('hidden');
    expect(session.textContent).toContain('Desktop workspace');
  });

  it('replaces the desktop for default and switch logins', () => {
    const defaultView = renderShell({ initialPhase: 'login', initialLoginMode: 'default' });
    expect(screen.getByText(/Welcome back,/)).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-content')).toBeNull();
    defaultView.unmount();
    cleanup();

    renderShell({ initialPhase: 'login', initialLoginMode: 'switch' });
    expect(screen.getByText(/Switch User,/)).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-content')).toBeNull();
  });

  it('returns to login after shutdown completes', () => {
    renderShell({ initialPhase: 'shutdown' });
    expect(screen.getByText('SHUTTING DOWN SHELL OS')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.getByText(/Welcome back,/)).toBeInTheDocument();
  });
});
