/**
 * VES-UI-001 T4: LoginScreen acceptance guards.
 *
 * - Modes `default / locked / switch` render distinct titles + captions.
 * - The user card resolves the real actor from `useAuth` — never the
 *   prototype's hardcoded `Eddie R Villanueva`.
 * - Submit (button or Enter) calls `onLogin`; `switch` mode persists the
 *   edited actor via `useAuth().setActor` first.
 * - Biometric / skip are explicit non-auth paths with dedicated callbacks.
 * - Brand-panel highlights come from fixtures; no version strings (G11).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../lib/auth';
import { setActor } from '../../lib/api';
import { desktopShellWorkspaceFixture } from './desktop-shell.fixtures';
import { LoginScreen, loginInitialsFor } from './LoginScreen.js';

function renderLogin(props: Partial<React.ComponentProps<typeof LoginScreen>> & { mode: React.ComponentProps<typeof LoginScreen>['mode'] }) {
  const onLogin = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  const view = render(<LoginScreen onLogin={onLogin} {...props} />, { wrapper });
  return { ...view, onLogin };
}

afterEach(() => {
  cleanup();
  setActor('eddie');
});

describe('loginInitialsFor', () => {
  it('derives initials from the display name', () => {
    expect(loginInitialsFor('Ada Lovelace')).toBe('AL');
    expect(loginInitialsFor('eddie')).toBe('E');
  });

  it('falls back to the fixture placeholder for blank names', () => {
    expect(loginInitialsFor('')).toBe('WO');
  });
});

describe('LoginScreen modes', () => {
  it('renders the default mode with the secure-login caption', () => {
    renderLogin({ mode: 'default' });
    expect(screen.getByText(/Welcome back,/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Secure login to Vestara Desktop • ${desktopShellWorkspaceFixture}`))).toBeInTheDocument();
    expect(screen.getByLabelText('PASSWORD')).toBeInTheDocument();
    expect(screen.queryByLabelText('USERNAME')).toBeNull();
  });

  it('renders the locked mode with the unlock caption', () => {
    renderLogin({ mode: 'locked' });
    expect(screen.getByText(/Locked,/)).toBeInTheDocument();
    expect(screen.getByText(/Enter password to unlock/)).toBeInTheDocument();
    expect(screen.getByLabelText('PASSWORD')).toBeInTheDocument();
  });

  it('renders the switch mode with a username field instead of a password', () => {
    renderLogin({ mode: 'switch' });
    expect(screen.getByText(/Switch User,/)).toBeInTheDocument();
    expect(screen.getByText(/Choose who signs in to this desktop/)).toBeInTheDocument();
    expect(screen.getByLabelText('USERNAME')).toBeInTheDocument();
    expect(screen.queryByLabelText('PASSWORD')).toBeNull();
  });
});

describe('LoginScreen actor', () => {
  it('resolves the real actor from useAuth — never the hardcoded prototype user', () => {
    const { container } = renderLogin({ mode: 'default' });
    expect(screen.getByText(/Welcome back, eddie\./)).toBeInTheDocument();
    expect(container.textContent).not.toContain('Eddie R Villanueva');
  });

  it('reflects a previously established actor', () => {
    setActor('grace');
    renderLogin({ mode: 'locked' });
    expect(screen.getByText(/Locked, grace\./)).toBeInTheDocument();
  });

  it('switch mode persists the edited actor before logging in', () => {
    const { onLogin } = renderLogin({ mode: 'switch' });
    fireEvent.change(screen.getByLabelText('USERNAME'), { target: { value: 'hopper' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Switch User, hopper\./)).toBeInTheDocument();
  });
});

describe('LoginScreen submit paths', () => {
  it('submits via the Continue button', () => {
    const { onLogin } = renderLogin({ mode: 'default' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('submits via Enter in the password field', () => {
    const { onLogin } = renderLogin({ mode: 'default' });
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 's3cret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Continue → Desktop' }).closest('form')!);
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('routes biometric and skip through their explicit non-auth callbacks', () => {
    const onLogin = vi.fn();
    const onBiometric = vi.fn();
    const onSkip = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    render(<LoginScreen mode="default" onLogin={onLogin} onBiometric={onBiometric} onSkip={onSkip} />, { wrapper });
    fireEvent.click(screen.getByTestId('login-biometric'));
    fireEvent.click(screen.getByTestId('login-skip'));
    expect(onBiometric).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('biometric and skip fall back to onLogin when no explicit handler is given', () => {
    const { onLogin } = renderLogin({ mode: 'default' });
    fireEvent.click(screen.getByTestId('login-biometric'));
    fireEvent.click(screen.getByTestId('login-skip'));
    expect(onLogin).toHaveBeenCalledTimes(2);
  });
});

describe('LoginScreen governance', () => {
  it('renders fixture highlights with no version strings', () => {
    const { container } = renderLogin({ mode: 'default' });
    for (const title of ['Terminal', 'Activity Room', 'Marketplace']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(container.textContent).not.toMatch(/FINAL/i);
  });
});
