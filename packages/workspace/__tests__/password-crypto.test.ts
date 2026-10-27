import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password-crypto';

describe('password-crypto (scrypt)', () => {
  it('hashes and verifies round-trip', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects wrong passwords and malformed hashes', async () => {
    const hash = await hashPassword('right');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
    await expect(verifyPassword('right', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('right', 'scrypt$N=bad$r=8$p=1$00$00')).resolves.toBe(false);
    await expect(verifyPassword('right', '')).resolves.toBe(false);
  });

  it('salts identical passwords differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});
