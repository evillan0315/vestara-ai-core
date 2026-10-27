import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type LoginCredentials, type LoginMfaChallenge, type LoginResult, LoginScreen } from '../features/desktop-shell/LoginScreen';
import { type AuthUser, useAuth } from '../lib/auth';
import { resolveHttpUrl } from '../lib/clientConfig';

interface LoginResponse {
  user?: AuthUser & { token: string };
  mfaRequired?: boolean;
  username?: string;
  error?: string;
}

/**
 * `/login` — the governed Workspace entry point.
 *
 * Renders the promoted desktop-shell `LoginScreen` (split brand/auth card,
 * wallpaper, teal identity) and exchanges credentials with the API before
 * handing the session to `AuthProvider`. The password field accepts a pasted
 * `vst_…` bearer token (submitted as a token) or an account password
 * (password endpoint, then an MFA code step when challenged).
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

  const postCredential = async (path: string, body: Record<string, string>) => {
    const res = await fetch(resolveHttpUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as LoginResponse;
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    return data;
  };

  const authenticate = async ({ username, password }: LoginCredentials): Promise<LoginResult> => {
    const name = username.trim() || actor || 'local-operator';
    const secret = password.trim();

    setAuthenticating(true);
    setError(null);
    try {
      if (secret.startsWith('vst_')) {
        const data = await postCredential('/api/auth/login', { token: secret });
        const user = data.user;
        if (!user?.token) throw new Error(data.error ?? 'Login failed');
        establishSession(user);
        return { mfaRequired: false };
      }
      if (!secret) {
        const data = await postCredential('/api/auth/login', { username: name });
        const user = data.user;
        if (!user?.token) throw new Error(data.error ?? 'Login failed');
        establishSession(user);
        return { mfaRequired: false };
      }
      const data = await postCredential('/api/auth/password', { username: name, password: secret });
      if (data.mfaRequired) return { mfaRequired: true };
      const user = data.user;
      if (!user?.token) throw new Error(data.error ?? 'Login failed');
      establishSession(user);
      return { mfaRequired: false };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
      throw err;
    } finally {
      setAuthenticating(false);
    }
  };

  const authenticateMfa = async ({ username, code }: LoginMfaChallenge) => {
    const name = username.trim() || actor || 'local-operator';
    setAuthenticating(true);
    setError(null);
    try {
      const data = await postCredential('/api/auth/mfa/verify', { username: name, code });
      const user = data.user;
      if (!user?.token) throw new Error(data.error ?? 'MFA verification failed');
      establishSession(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify code');
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
        onAuthenticateMfa={authenticateMfa}
        onLogin={() => navigate('/overview', { replace: true })}
        authenticating={authenticating}
        authError={error}
        showDemoLinks={false}
      />
    </div>
  );
}
