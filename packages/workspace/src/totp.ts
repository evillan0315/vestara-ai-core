/**
 * TOTP (RFC 6238) core for MFA — node:crypto only, no new dependencies.
 * SHA-1 / 30s step / 6 digits (the authenticator-app default).
 */

import * as crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const clean = input.trim().replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) throw new Error('Invalid base32 secret.');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += '=';
  return output;
}

/** New random 160-bit secret, base32-encoded without padding. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20)).replace(/=+$/, '');
}

function hotp(secret: Buffer, counter: bigint): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Current TOTP code (primarily for tests — authenticators generate their own). */
export function totpNow(secretBase32: string, atMs = Date.now()): string {
  const counter = BigInt(Math.floor(atMs / 30_000));
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verify a 6-digit code within ±window steps (clock skew tolerance).
 * Constant-time comparison per candidate; false on malformed input.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1, atMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (secret.length === 0) return false;
  const counter = BigInt(Math.floor(atMs / 30_000));
  const candidate = Buffer.from(code);
  for (let step = -window; step <= window; step++) {
    const expected = Buffer.from(hotp(secret, counter + BigInt(step)));
    if (expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate)) return true;
  }
  return false;
}

/** otpauth:// URL for QR provisioning in authenticator apps. */
export function totpProvisioningUrl(secretBase32: string, account: string, issuer = 'Vestara'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
