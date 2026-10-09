import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getActor, setActor as persistActor } from './api';
import { resolveHttpUrl } from './clientConfig';

const TOKEN_KEY = 'vestara-auth-token';
const ACTOR_KEY = 'vestara-actor';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
}

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAuthSession(user: AuthUser & { token: string }): void {
  localStorage.setItem(TOKEN_KEY, user.token);
  localStorage.setItem(ACTOR_KEY, user.username);
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTOR_KEY);
}

/** Attach the persisted bearer token to every browser API request. */
export function installAuthFetch(): void {
  const browser = globalThis as typeof globalThis & { __vestaraAuthFetchInstalled?: boolean };
  if (browser.__vestaraAuthFetchInstalled || typeof window === 'undefined') return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
    const isApiRequest = new URL(url, window.location.href).pathname.startsWith('/api/');
    const token = readToken();
    if (!isApiRequest || !token) return originalFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return originalFetch(input, { ...init, headers });
  };
  browser.__vestaraAuthFetchInstalled = true;
}

interface AuthState {
  actor: string;
  setActor: (name: string) => void;
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  establishSession: (user: AuthUser & { token: string }) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActorState] = useState(getActor);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(readToken()));

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(resolveHttpUrl('/api/auth/me'))
      .then(async (response) => {
        if (!response.ok) throw new Error('Session is no longer valid');
        const data = (await response.json()) as { currentUser?: AuthUser };
        if (!data.currentUser) throw new Error('Session user is unavailable');
        setUser(data.currentUser);
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      actor,
      setActor: (name: string) => {
        persistActor(name);
        setActorState(getActor());
      },
      user,
      loading,
      logout: () => {
        clearAuthSession();
        setUser(null);
        setActorState('local-operator');
      },
      establishSession: (nextUser) => {
        setAuthSession(nextUser);
        setUser(nextUser);
        setActorState(nextUser.username);
      },
    }),
    [actor, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
