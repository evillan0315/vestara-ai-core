/**
 * Password hashing for API users — scrypt via node:crypto (no new
 * dependencies). Hashes are self-describing so parameters can evolve:
 * `scrypt$N=<n>$r=<r>$p=<p>$<saltHex>$<hashHex>`.
 */

import * as crypto from 'node:crypto';

const KEYLEN = 64;
const OPTIONS = { N: 16384, r: 8, p: 1 } as const;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

/** Hash a password for storage. Never returns the input. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return `scrypt$N=${OPTIONS.N}$r=${OPTIONS.r}$p=${OPTIONS.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time password verification. False on malformed hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const params: Record<string, number> = {};
  for (const part of parts.slice(1, 4)) {
    const [key, raw] = part.split('=');
    const value = Number(raw);
    if (!key || !Number.isInteger(value) || value <= 0) return false;
    params[key] = value;
  }
  if (params.N === undefined || params.r === undefined || params.p === undefined) return false;
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (salt.length !== 16 || expected.length !== KEYLEN) return false;
  try {
    const derived: Buffer = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, KEYLEN, { N: params.N, r: params.r, p: params.p }, (error, key) => {
        if (error) reject(error);
        else resolve(key as Buffer);
      });
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
