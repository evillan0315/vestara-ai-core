import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateTotpSecret, totpNow, totpProvisioningUrl, verifyTotp } from '../src/totp';

describe('totp core (RFC 6238)', () => {
  it('round-trips base32', () => {
    const raw = Buffer.from('vestara-mfa-test');
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
  });

  it('verifies the current code and rejects neighbors of the window', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = totpNow(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, 1, now)).toBe(true);
    expect(verifyTotp(secret, '000000', 1, now)).toBe(false);
    expect(verifyTotp(secret, totpNow(secret, now - 90_000), 1, now)).toBe(false);
    expect(verifyTotp(secret, totpNow(secret, now - 30_000), 1, now)).toBe(true);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyTotp('!!!', '123456')).toBe(false);
    expect(verifyTotp(generateTotpSecret(), '12')).toBe(false);
    expect(verifyTotp(generateTotpSecret(), 'abcdef')).toBe(false);
  });

  it('builds a provisioning URL for authenticator apps', () => {
    const url = totpProvisioningUrl('JBSWY3DPEHPK3PXP', 'eddie');
    expect(url.startsWith('otpauth://totp/Vestara:eddie?')).toBe(true);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
  });
});
