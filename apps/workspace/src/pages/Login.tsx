import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type LoginCredentials, LoginScreen } from '../features/desktop-shell/LoginScreen';
import { type AuthUser, useAuth } from '../lib/auth';
import { resolveHttpUrl } from '../lib/clientConfig';

interface LoginResponse {
  user?: AuthUser & { token: string };
  error?: string;
}

/**
 * `/login` — the governed Workspace entry point.
 *
 * Renders the promoted desktop-shell `LoginScreen` (split brand/auth card,
 * wallpaper, teal identity) and exchanges credentials with the API before
 * handing the session to `AuthProvider`. The API accepts a username or a
 * pasted `vst_…` bearer token; there is no password authority, so a value in
 * the password field that looks like a token is submitted as a token.
 *
 * The prototype biometric / skip demo paths are intentionally hidden here:
 * they bypass authentication and `ProtectedPage` would bounce the visitor
 * straight back to `/login`.
 */
export default function Login() {
  const { actor, establishSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  const authenticate = async ({ username, password }: LoginCredentials) => {
    const name = username.trim() || actor || 'local-operator';
    const token = password.trim();
    const body = token.startsWith('vst_') ? { token } : { username: name };

    setAuthenticating(true);
    setError(null);
    try {
      const res = await fetch(resolveHttpUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResponse;
      const user = data.user;
      if (!res.ok || !user?.token) throw new Error(data.error ?? 'Login failed');
      establishSession(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      throw err;
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <LoginScreen
        mode="default"
        onAuthenticate={authenticate}
        onLogin={() => navigate('/overview', { replace: true })}
        authenticating={authenticating}
        authError={error}
        showDemoLinks={false}
      />
    </div>
  );
}
