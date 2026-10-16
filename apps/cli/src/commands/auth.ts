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
  error?: string;
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
      console.log(`${GRAY}  login  [--username <name>] [--token <token>] [--endpoint <url>]${RESET}`);
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
  if (!username && !providedToken) {
    console.error(`${RED}Provide --username <name> or --token <token>.${RESET}`);
    process.exitCode = 1;
    return;
  }

  const body = providedToken ? { token: providedToken } : { username };
  let response: Response;
  try {
    response = await fetch(`${endpoint}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`${RED}Cannot reach the Vestara API at ${endpoint}: ${(error as Error).message}${RESET}`);
    process.exitCode = 1;
    return;
  }

  const data = (await response.json().catch(() => ({}))) as LoginResponse;
  if (!response.ok || !data.user?.token) {
    console.error(`${RED}Authentication failed: ${data.error ?? `HTTP ${response.status}`}${RESET}`);
    process.exitCode = 1;
    return;
  }

  const auth: Omit<StoredAuth, 'savedAt'> = {
    endpoint,
    token: data.user.token,
    username: data.user.username,
    role: data.user.role,
  };
  writeAuth(auth);

  console.log(`${GREEN}✓${RESET} Authenticated as ${BOLD}${data.user.username}${RESET} (${data.user.role})`);
  console.log(`${GRAY}  Endpoint:   ${endpoint}${RESET}`);
  console.log(`${GRAY}  Session:    ${authFilePath()}${RESET}`);
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
