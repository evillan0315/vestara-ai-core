import { describe, expect, it } from 'vitest';
import { buildCorrelation, methodConfidence } from '../src/correlation';
import { isSensitiveKey, redact, redactValue } from '../src/redact';

describe('external runtime redaction contract', () => {
  it('flags sensitive keys and masks secret-shaped values', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('username')).toBe(false);
    expect(redactValue('sk-abcdefgh12345678')).toBe('[REDACTED]');
    expect(redactValue('hello world')).toBe('hello world');
    const cleaned = redact({ apiKey: 'sk-abcdefgh12345678', task: 'build' });
    expect(cleaned.task).toBe('build');
    expect(cleaned.apiKey).not.toBe('sk-abcdefgh12345678');
  });

  it('builds deterministic correlations with method confidence', () => {
    expect(methodConfidence('explicit')).toBe(1.0);
    const correlation = buildCorrelation({
      runtimeInstanceId: 'rt-1',
      runtimeType: 'opencode',
      externalSessionId: 'ses-1',
      workspaceId: 'ws-1',
      authoritative: false,
      method: 'git-branch',
      evidence: [],
    });
    expect(correlation.id).toBe('corr-rt-1-ses-1');
    expect(correlation.confidence).toBe(methodConfidence('git-branch'));
  });
});
