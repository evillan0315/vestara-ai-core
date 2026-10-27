/**
 * Machine credential key for encrypting MFA secrets at rest.
 * `VESTARA_CREDENTIAL_KEY` (64 hex chars) wins; otherwise a 0600 key file
 * is generated once under the workspace dir. Logged only on generation.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function credentialKey(
  repoPath: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Buffer {
  const raw = (env.VESTARA_CREDENTIAL_KEY ?? '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw) console.warn('[auth] ignoring malformed VESTARA_CREDENTIAL_KEY (want 64 hex chars)');

  const file = path.join(repoPath, '.vestara', 'credential.key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(existing)) return Buffer.from(existing, 'hex');
  } catch {
    // Missing or unreadable — generate below.
  }
  const fresh = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${fresh.toString('hex')}\n`, { mode: 0o600 });
  console.log('[auth] generated machine credential key (stored 0600, shown never)');
  return fresh;
}

/** AES-256-GCM envelope: `ivHex:cipherHex:tagHex`. */
export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${cipher.getAuthTag().toString('hex')}`;
}

export function decryptSecret(key: Buffer, payload: string): string {
  const [ivHex, cipherHex, tagHex] = payload.split(':');
  if (!ivHex || !cipherHex || !tagHex) throw new Error('Malformed secret envelope.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(cipherHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

/** Keyed digest for single-use backup codes (fast; codes carry the entropy). */
export function backupCodeDigest(key: Buffer, code: string): string {
  return crypto.createHmac('sha256', key).update(code).digest('hex');
}
