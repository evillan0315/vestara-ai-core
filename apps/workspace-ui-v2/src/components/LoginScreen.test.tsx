/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;
const _err = (status: number, data: unknown) => ok(data, status);

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)),
  );
}

describe('LoginScreen credential flows', () => {
  it('challenges for MFA after a password login and verifies into the desktop', async () => {
    stubFetch(async (url) => {
      if (url === '/api/auth/password') return ok({ mfaRequired: true, username: 'eddie' });
      if (url === '/api/auth/mfa/verify') return ok({ user: { token: 'tok-mfa', username: 'eddie' } });
      throw new Error(`unexpected ${url}`);
    });
    const onLogin = vi.fn();
    render(<LoginScreen mode="default" onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 's3cret' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));
    });
    expect(await screen.findByLabelText('AUTHENTICATOR CODE')).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('AUTHENTICATOR CODE'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify code → Desktop' }));
    });
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('vestara-assistant-token')).toBe('tok-mfa');
  });

  it('enters offline when the API is unreachable without a password', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const onLogin = vi.fn();
    render(<LoginScreen mode="default" onLogin={onLogin} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));
    });
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/continuing offline/)).toBeTruthy();
  });

  it('skips to the desktop offline without a session', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const onLogin = vi.fn();
    render(<LoginScreen mode="default" onLogin={onLogin} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skip to Desktop' }));
    });
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No session — continuing offline/)).toBeTruthy();
  });

  it('restores live session metadata from a valid persisted token', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-live');
    stubFetch(async (url) => {
      if (url === '/api/auth/me') return ok({ user: { name: 'eddie', role: 'admin' } });
      if (url === '/api/agents') return ok({ agents: [{ id: 'a1', name: 'Atlas' }] });
      throw new Error(`unexpected ${url}`);
    });
    render(<LoginScreen mode="default" onLogin={vi.fn()} />);
    expect(await screen.findByText('eddie • admin • 1 agents ready')).toBeTruthy();
  });
});
