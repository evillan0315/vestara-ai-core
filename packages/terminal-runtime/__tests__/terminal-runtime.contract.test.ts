import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/redact';

describe('terminal transcript redaction contract', () => {
  it('masks AWS keys, tokens, and bearer credentials', () => {
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[redacted]');
    expect(redactSecrets('ghp_abcdefghijklmnopqrst')).toBe('[redacted]');
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnop')).toContain('Bearer [redacted]');
    expect(redactSecrets('API_KEY=supersecret123')).toBe('API_KEY=[redacted]');
  });

  it('passes ordinary output through untouched', () => {
    expect(redactSecrets('hello world')).toBe('hello world');
    expect(redactSecrets('')).toBe('');
  });
});
