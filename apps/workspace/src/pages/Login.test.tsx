/**
 * `/login` integration guards: the routed page renders the desktop-shell
 * login card, exchanges credentials with the API, persists the bearer token,
 * and only then enters the workspace. Failures stay on the form.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import Login from './Login';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/overview" element={<div>workspace overview</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('/login', () => {
  it('authenticates the entered username and enters the workspace', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u1', username: 'grace', role: 'editor', token: 'vst_test' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    fireEvent.change(screen.getByLabelText('USERNAME'), { target: { value: 'grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));

    await waitFor(() => expect(screen.getByText('workspace overview')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('vestara-auth-token')).toBe('vst_test');
  });

  it('submits a pasted bearer token instead of a username', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u1', username: 'admin', role: 'admin', token: 'vst_pasted' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'vst_pasted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));

    await waitFor(() => expect(screen.getByText('workspace overview')).toBeInTheDocument());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ token: 'vst_pasted' });
  });

  it('keeps the visitor on the form when the API rejects the login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid token.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Continue → Desktop' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid token.'));
    expect(screen.queryByText('workspace overview')).toBeNull();
    expect(localStorage.getItem('vestara-auth-token')).toBeNull();
  });
});
