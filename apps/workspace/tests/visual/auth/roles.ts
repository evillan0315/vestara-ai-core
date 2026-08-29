/**
 * Auth roles and storage-state management.
 *
 * The Workspace authenticates via localStorage (`vestara-actor`, and
 * optionally `vestara-auth-token`). Each role gets its own Playwright storage
 * state file so authenticated routes render with the right identity and no
 * per-run login is needed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { outputLayout } from '../config.js';

/** Minimal Playwright StorageState shape (the subset the framework writes). */
export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

export interface Role {
  id: string;
  label: string;
  actor: string;
  /** Token seeded for authenticated requests (may be empty for local). */
  token?: string;
}

export const ROLES: Role[] = [
  { id: 'admin', label: 'Administrator', actor: 'admin' },
  { id: 'reviewer', label: 'Reviewer', actor: 'reviewer' },
  { id: 'developer', label: 'Developer', actor: 'developer' },
  { id: 'investor', label: 'Investor', actor: 'investor' },
  { id: 'guest', label: 'Guest', actor: 'guest' },
];

export function roleById(id: string): Role {
  return ROLES.find((r) => r.id === id) ?? ROLES[0];
}

export function storageStatePath(roleId: string): string {
  return path.join(outputLayout().storage, `${roleId}.json`);
}

/** Build a Playwright StorageState with the role's identity. */
export function buildStorageState(role: Role): StorageState {
  return {
    cookies: [],
    origins: [
      {
        origin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
        localStorage: [
          { name: 'vestara-actor', value: role.actor },
          ...(role.token ? [{ name: 'vestara-auth-token', value: role.token }] : []),
        ],
      },
    ],
  };
}

/** Ensure storage-state files exist for every role. */
export function ensureStorageStates(): string[] {
  const dir = outputLayout().storage;
  fs.mkdirSync(dir, { recursive: true });
  return ROLES.map((role) => {
    const file = storageStatePath(role.id);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(buildStorageState(role), null, 2));
    }
    return file;
  });
}
