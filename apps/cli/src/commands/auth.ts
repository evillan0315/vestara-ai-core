/**
 * `vestara auth` — authentication command group.
 *
 * On the Vestara OS the shared session file (`~/.config/vestara/auth.json`) is
 * provisioned by the OS/Vestara login; the CLI and TUI read it automatically and
 * no manual login is required. `vestara auth login` exists for the standalone
 * case — when the CLI is installed on another operating system with no
 * OS-mediated login.
 */

import { authFilePath, clearAuth, DEFAULT_ENDPOINT, readAuth, type StoredAuth, writeAuth } from '../lib/auth-store.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveEndpoint(args: readonly string[]): string {
  const endpoint =
    argValue(args, '--endpoint') ?? process.env.VESTARA_API_URL ?? readAuth()?.endpoint ?? DEFAULT_ENDPOINT;
  return endpoint.replace(/\/+$/, '');
}

interface LoginResponse {
  user?: { id: string; username: string; role?: string; token?: string };
  mfaRequired?: boolean;
  username?: string;
  error?: string;
}

async function postAuth(endpoint: string, path: string, body: Record<string, string>): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`${RED}Cannot reach the Vestara API at ${endpoint}: ${(error as Error).message}${RESET}`);
    process.exitCode = 1;
    throw error;
  }
  const data = (await response.json().catch(() => ({}))) as LoginResponse & { error?: string };
  if (!response.ok) {
    console.error(`${RED}Authentication failed: ${data.error ?? `HTTP ${response.status}`}${RESET}`);
    process.exitCode = 1;
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
  return data;
}

function storeSession(endpoint: string, user: { token: string; username: string; role?: string }): void {
  const auth: Omit<StoredAuth, 'savedAt'> = {
    endpoint,
    token: user.token,
    username: user.username,
    role: user.role,
  };
  writeAuth(auth);

  console.log(`${GREEN}✓${RESET} Authenticated as ${BOLD}${user.username}${RESET} (${user.role})`);
  console.log(`${GRAY}  Endpoint:   ${endpoint}${RESET}`);
  console.log(`${GRAY}  Session:    ${authFilePath()}${RESET}`);
}

export async function runAuth(args: readonly string[]): Promise<void> {
  const subcommand = args[0] ?? 'status';
  switch (subcommand) {
    case 'login':
      await login(args);
      return;
    case 'logout':
      logout();
      return;
    case 'status':
    case 'whoami':
      await status(args);
      return;
    case 'token':
      token();
      return;
    default:
      console.log(`${GOLD}Usage: vestara auth <login|status|logout|token>${RESET}`);
      console.log(
        `${GRAY}  login  [--username <name>] [--token <token>] [--password <pw>] [--mfa-code <code>] [--endpoint <url>]${RESET}`,
      );
      console.log(`${GRAY}         Passwords may also come from VESTARA_AUTH_PASSWORD (avoids shell history).${RESET}`);
      console.log(`${GRAY}  status                     Show the current session${RESET}`);
      console.log(`${GRAY}  logout                     Remove the stored session${RESET}`);
      console.log(`${GRAY}  token                      Print the stored token${RESET}`);
      process.exitCode = 1;
  }
}

async function login(args: readonly string[]): Promise<void> {
  const endpoint = resolveEndpoint(args);
  const username = argValue(args, '--username')?.trim();
  const providedToken = argValue(args, '--token')?.trim();
  const password = argValue(args, '--password') ?? process.env.VESTARA_AUTH_PASSWORD;
  const mfaCode = argValue(args, '--mfa-code')?.trim();
  if (!username && !providedToken) {
    console.error(`${RED}Provide --username <name> or --token <token>.${RESET}`);
    process.exitCode = 1;
    return;
  }

  try {
    if (providedToken) {
      const data = await postAuth(endpoint, '/api/auth/login', { token: providedToken });
      if (!data.user?.token) throw new Error('Login returned no token');
      storeSession(endpoint, { token: data.user.token, username: data.user.username, role: data.user.role });
      return;
    }
    if (password && username) {
      const data = await postAuth(endpoint, '/api/auth/password', { username, password });
      if (data.mfaRequired) {
        if (!mfaCode) {
          console.error(`${RED}Password accepted — MFA required. Re-run with --mfa-code <code>.${RESET}`);
          process.exitCode = 1;
          return;
        }
        const verified = await postAuth(endpoint, '/api/auth/mfa/verify', { username, code: mfaCode });
        if (!verified.user?.token) throw new Error('MFA verification returned no token');
        storeSession(endpoint, {
          token: verified.user.token,
          username: verified.user.username,
          role: verified.user.role,
        });
        return;
      }
      if (!data.user?.token) throw new Error('Login returned no token');
      storeSession(endpoint, { token: data.user.token, username: data.user.username, role: data.user.role });
      return;
    }
    const data = await postAuth(endpoint, '/api/auth/login', { username: username ?? '' });
    if (!data.user?.token) throw new Error('Login returned no token');
    storeSession(endpoint, { token: data.user.token, username: data.user.username, role: data.user.role });
  } catch {
    if (process.exitCode === 0) process.exitCode = 1;
  }
}

async function status(args: readonly string[]): Promise<void> {
  const stored = readAuth();
  if (!stored) {
    console.log(`${GOLD}Not authenticated.${RESET}`);
    console.log(`${GRAY}  On the Vestara OS this file is provisioned at login (${authFilePath()}).${RESET}`);
    console.log(`${GRAY}  Otherwise run: vestara auth login --username <name>${RESET}`);
    return;
  }

  const endpoint = resolveEndpoint(args);
  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/auth/me`, {
      headers: { Authorization: `Bearer ${stored.token}` },
    });
  } catch (error) {
    console.error(`${RED}Cannot reach the Vestara API at ${endpoint}: ${(error as Error).message}${RESET}`);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    console.error(`${RED}Stored session rejected (HTTP ${response.status}). Re-run vestara auth login.${RESET}`);
    process.exitCode = 1;
    return;
  }

  const data = (await response.json()) as {
    user?: { role?: string };
    currentUser?: { username?: string; role?: string };
  };
  const name = data.currentUser?.username ?? stored.username ?? 'unknown';
  const role = data.currentUser?.role ?? data.user?.role ?? stored.role ?? 'unknown';
  console.log(`${GREEN}✓${RESET} Authenticated as ${BOLD}${name}${RESET} (${role})`);
  console.log(`${GRAY}  Endpoint:   ${endpoint}${RESET}`);
  console.log(`${GRAY}  Session:    ${authFilePath()}${RESET}`);
}

function logout(): void {
  clearAuth();
  console.log(`${GREEN}✓${RESET} Signed out. Removed ${authFilePath()}`);
}

function token(): void {
  const stored = readAuth();
  if (!stored) {
    console.error(`${RED}Not authenticated.${RESET}`);
    process.exitCode = 1;
    return;
  }
  console.log(stored.token);
}
