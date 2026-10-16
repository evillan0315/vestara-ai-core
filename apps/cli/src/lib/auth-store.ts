/**
 * CLI authentication credential store.
 *
 * The Vestara API enforces Bearer auth on every `/api/*` request (VES-AUTH-001,
 * fail-closed). The CLI and the TUI therefore need a token. `vestara auth login`
 * exchanges a username (or an existing token) for a session token via the public
 * `POST /api/auth/login` endpoint and persists it here, keyed by API endpoint.
 *
 * Location: `$VESTARA_AUTH_FILE`, else `$XDG_CONFIG_HOME/vestara/auth.json`,
 * else `~/.config/vestara/auth.json` (mode 0600).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface StoredAuth {
  /** API base URL the token was issued for. */
  endpoint: string;
  /** Bearer token. */
  token: string;
  username?: string;
  role?: string;
  savedAt: string;
}

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:3001';

/** Resolve the credentials file path (honors `VESTARA_AUTH_FILE` for tests). */
export function authFilePath(): string {
  if (process.env.VESTARA_AUTH_FILE) return process.env.VESTARA_AUTH_FILE;
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'vestara', 'auth.json');
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

export function readAuth(): StoredAuth | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(authFilePath(), 'utf8')) as Partial<StoredAuth>;
    if (typeof parsed.token !== 'string' || parsed.token.length === 0) return null;
    if (typeof parsed.endpoint !== 'string' || parsed.endpoint.length === 0) return null;
    return {
      endpoint: parsed.endpoint,
      token: parsed.token,
      username: parsed.username,
      role: parsed.role,
      savedAt: parsed.savedAt ?? '',
    };
  } catch {
    return null;
  }
}

export function writeAuth(auth: Omit<StoredAuth, 'savedAt'> & { savedAt?: string }): void {
  const file = authFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload: StoredAuth = {
    ...auth,
    endpoint: normalizeEndpoint(auth.endpoint),
    savedAt: auth.savedAt ?? new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best-effort hardening; not all filesystems support chmod.
  }
}

export function clearAuth(): void {
  try {
    fs.rmSync(authFilePath(), { force: true });
  } catch {
    // Already gone.
  }
}

/**
 * Token to authenticate with, from `VESTARA_API_KEY` (highest precedence) or the
 * stored credentials. When `endpoint` is given, a stored token for a different
 * endpoint is not used.
 */
export function resolveAuthToken(endpoint?: string): string | undefined {
  const envKey = process.env.VESTARA_API_KEY?.trim();
  if (envKey) return envKey;
  const stored = readAuth();
  if (!stored) return undefined;
  if (endpoint && normalizeEndpoint(stored.endpoint) !== normalizeEndpoint(endpoint)) return undefined;
  return stored.token;
}
