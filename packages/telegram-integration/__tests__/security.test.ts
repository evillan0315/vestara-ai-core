/**
 * VES-TG-025: Security hardening — tests
 */

import { describe, expect, it } from 'vitest';
import { TelegramSecurityGuard } from '../src/security';

describe('webhook secret', () => {
  const guard = new TelegramSecurityGuard();

  it('accepts the matching secret', () => {
    expect(guard.verifyWebhookSecret('s3cret', 's3cret').allowed).toBe(true);
  });

  it('rejects a spoofed secret', () => {
    expect(guard.verifyWebhookSecret('wrong', 's3cret').reason).toBe('invalid-secret');
  });

  it('fails closed when the expected secret is not configured', () => {
    expect(guard.verifyWebhookSecret('anything', undefined).allowed).toBe(false);
  });
});

describe('callback replay', () => {
  it('accepts the first sighting and rejects replays', () => {
    const guard = new TelegramSecurityGuard({ callbackTtlMs: 1000 });
    expect(guard.checkCallback('cb-1', 0).allowed).toBe(true);
    expect(guard.checkCallback('cb-1', 10).reason).toBe('replayed-callback');
  });

  it('prunes expired records so a late retry is treated as new', () => {
    const guard = new TelegramSecurityGuard({ callbackTtlMs: 1000 });
    guard.checkCallback('cb-1', 0);
    expect(guard.checkCallback('cb-1', 5000).allowed).toBe(true);
  });

  it('rejects an empty callback id', () => {
    expect(new TelegramSecurityGuard().checkCallback('').reason).toBe('unknown-callback');
  });
});

describe('pairing token', () => {
  const guard = new TelegramSecurityGuard();
  const now = new Date('2026-09-16T10:00:00.000Z');

  it('accepts a pending, unexpired token', () => {
    expect(guard.checkPairingToken({ status: 'pending', expiresAt: '2026-09-16T10:10:00.000Z' }, now).allowed).toBe(
      true,
    );
  });

  it('rejects an expired token', () => {
    expect(guard.checkPairingToken({ status: 'pending', expiresAt: '2026-09-16T09:00:00.000Z' }, now).reason).toBe(
      'expired-token',
    );
  });

  it('rejects an already-approved token', () => {
    expect(
      guard.checkPairingToken(
        { status: 'approved', expiresAt: '2026-09-16T10:10:00.000Z', approvedAt: '2026-09-16T09:59:00.000Z' },
        now,
      ).reason,
    ).toBe('token-already-used');
  });
});

describe('approvals', () => {
  const guard = new TelegramSecurityGuard({ approvalTtlMs: 15 * 60 * 1000 });
  const now = new Date('2026-09-16T10:00:00.000Z');

  it('accepts a fresh approval for a running execution', () => {
    expect(
      guard.checkApproval({ requestedAt: '2026-09-16T09:58:00.000Z', executionStatus: 'executing' }, now).allowed,
    ).toBe(true);
  });

  it('rejects a stale approval', () => {
    expect(
      guard.checkApproval({ requestedAt: '2026-09-16T09:00:00.000Z', executionStatus: 'executing' }, now).reason,
    ).toBe('stale-approval');
  });

  it('rejects an approval for a completed execution', () => {
    expect(
      guard.checkApproval({ requestedAt: '2026-09-16T09:59:00.000Z', executionStatus: 'completed' }, now).reason,
    ).toBe('approval-after-terminal');
  });
});

describe('principal and workspace scope', () => {
  const guard = new TelegramSecurityGuard();

  it('rejects a revoked principal', () => {
    expect(guard.checkPrincipalActive(false).reason).toBe('revoked-principal');
    expect(guard.checkPrincipalActive(true).allowed).toBe(true);
  });

  it('rejects a cross-workspace request', () => {
    expect(guard.checkWorkspaceScope('ws-1', 'ws-2').reason).toBe('cross-workspace');
    expect(guard.checkWorkspaceScope('ws-1', 'ws-1').allowed).toBe(true);
    expect(guard.checkWorkspaceScope(undefined, 'ws-1').allowed).toBe(false);
  });

  it('rejects when the integration is disabled', () => {
    expect(guard.checkIntegrationEnabled(false).reason).toBe('integration-disabled');
  });
});

describe('callback data and command input', () => {
  const guard = new TelegramSecurityGuard();

  it('rejects oversized or unknown-namespace callback data', () => {
    expect(guard.checkCallbackData('a'.repeat(65)).allowed).toBe(false);
    expect(guard.checkCallbackData('BAD SPACE:x').reason).toBe('invalid-command');
    expect(guard.checkCallbackData('exec:cancel:1').allowed).toBe(true);
  });

  it('strips control characters and flags shell metacharacters', () => {
    const dirty = guard.sanitizeCommandInput('run; rm -rf /\u0000');
    expect(dirty.value).toBe('run; rm -rf /');
    expect(dirty.containsShellMetacharacters).toBe(true);

    const clean = guard.sanitizeCommandInput('run affected tests');
    expect(clean.value).toBe('run affected tests');
    expect(clean.containsShellMetacharacters).toBe(false);
  });

  it('returns null for empty or missing input', () => {
    expect(guard.sanitizeCommandInput('   ').value).toBeNull();
    expect(guard.sanitizeCommandInput(undefined).value).toBeNull();
  });
});
