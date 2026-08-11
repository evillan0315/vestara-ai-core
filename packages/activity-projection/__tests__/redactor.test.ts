import type { AgentMessageActivity, TestActivity } from '@vestara/activity-projection';
import { ActivityRedactor, DEFAULT_REDACTION_POLICY } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';

function agentMessage(overrides: Partial<AgentMessageActivity>): AgentMessageActivity {
  return {
    id: 'activity:1:agent-message',
    sequence: 1,
    timestamp: '2026-08-06T12:00:00.000Z',
    actor: { type: 'system', id: 'engineer', displayName: 'engineer', role: 'system' },
    kind: 'agent-message',
    agentId: 'engineer',
    messageKind: 'message',
    content: 'hello',
    evidenceRefs: [],
    ...overrides,
  };
}

describe('ActivityRedactor', () => {
  it('replaces values under sensitive keys by key name', () => {
    const redactor = new ActivityRedactor({
      sensitiveKeys: ['content'],
      sensitivePatterns: [],
      replacement: '[REDACTED]',
    });
    const record = agentMessage({ content: 'must not reach the workspace' });
    expect(redactor.redact(record).content).toBe('[REDACTED]');
  });

  it('redacts token-like values by pattern', () => {
    const redactor = new ActivityRedactor();
    const record = agentMessage({ content: 'key: sk-0123456789abcdef0123456789abcdef012345' });
    const redacted = redactor.redact(record);
    expect(redacted.content).toContain(DEFAULT_REDACTION_POLICY.replacement);
    expect(redacted.content).not.toMatch(/sk-[A-Za-z0-9]+/);
  });

  it('redacts bearer tokens and private keys by pattern', () => {
    const redactor = new ActivityRedactor();
    const record = agentMessage({ content: 'Authorization: Bearer abc.def.ghi.2026' });
    expect(redactor.redact(record).content).not.toMatch(/Bearer\s+abc/i);

    const keyRecord = agentMessage({
      content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
    });
    expect(redactor.redact(keyRecord).content).not.toMatch(/BEGIN.*PRIVATE KEY/);
  });

  it('redacts nested and array values without touching benign fields', () => {
    const redactor = new ActivityRedactor();
    const record: TestActivity = {
      id: 'activity:1:test',
      sequence: 1,
      timestamp: '2026-08-06T12:00:00.000Z',
      actor: { type: 'system', id: 'verification-runtime', displayName: 'verification-runtime', role: 'verification' },
      kind: 'test',
      command: 'verification',
      passed: 23,
      failed: 1,
      skipped: 0,
      failureFingerprints: ['repo-scope-mismatch'],
      outputExcerpt: 'credentials: sk-0123456789abcdef0123456789abcdef012345, line: 42',
      evidenceRefs: [],
    };
    const redacted = redactor.redact(record);
    expect(redacted.outputExcerpt).toBe('credentials: [REDACTED], line: 42');
    expect(redacted.passed).toBe(23);
    expect(redacted.failureFingerprints).toEqual(['repo-scope-mismatch']);
  });

  it('does not mutate the input record', () => {
    const redactor = new ActivityRedactor();
    const record = agentMessage({ content: 'sk-0123456789abcdef0123456789abcdef012345' });
    const before = record.content;
    redactor.redact(record);
    expect(record.content).toBe(before);
  });

  it('leaves safe metadata and plain text intact', () => {
    const redactor = new ActivityRedactor();
    const record = agentMessage({ content: '23 passed, 0 failed. credentialEnvVar: OPENCODE_GO_API_KEY' });
    expect(redactor.redact(record).content).toBe('23 passed, 0 failed. credentialEnvVar: OPENCODE_GO_API_KEY');
  });
});
