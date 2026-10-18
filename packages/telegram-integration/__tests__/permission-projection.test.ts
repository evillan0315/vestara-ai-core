/**
 * VES-TG-016 — Telegram governed permission request tests.
 *
 * Proves:
 * - pending requests project with approve/deny buttons,
 * - approved/denied/expired requests are not projected,
 * - callback parsing is fail-closed (foreign/malformed taps ignored),
 * - only approve/deny/view intents are supported,
 * - stale/unauthorized responses are rejected,
 * - callback data stays within Telegram's 64-byte limit.
 */

import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CALLBACK_PREFIX,
  type ProjectablePermissionRequest,
  TelegramPermissionProjection,
  validateApprovalIntent,
} from '../src/permission-projection';

function request(overrides?: Partial<ProjectablePermissionRequest>): ProjectablePermissionRequest {
  return {
    approvalId: 'apr-1',
    callId: 'call-1',
    toolName: 'bash',
    reason: 'Run destructive command',
    risk: 'high',
    status: 'pending',
    requestedAt: '2026-10-18T10:00:00Z',
    ...overrides,
  };
}

describe('TelegramPermissionProjection.projectRequest', () => {
  it('projects a pending request with approve/deny buttons', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request(), 'chat-1');
    expect(delivery).not.toBeNull();
    expect(delivery!.content.text).toContain('Approval Required');
    expect(delivery!.content.text).toContain('bash');
    expect(delivery!.content.text).toContain('High');
    expect(delivery!.content.text).toContain('Run destructive command');

    const keyboard = delivery!.content.inlineKeyboard!;
    expect(keyboard).toHaveLength(2);
    expect(keyboard[0]!.map((b) => b.callbackData)).toEqual([
      `${PERMISSION_CALLBACK_PREFIX}:approve:apr-1`,
      `${PERMISSION_CALLBACK_PREFIX}:deny:apr-1`,
    ]);
  });

  it('returns null for approved requests', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request({ status: 'approved' }), 'chat-1');
    expect(delivery).toBeNull();
  });

  it('returns null for denied requests', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request({ status: 'denied' }), 'chat-1');
    expect(delivery).toBeNull();
  });

  it('returns null for expired requests', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request({ expiresAt: '2020-01-01T00:00:00Z' }), 'chat-1');
    expect(delivery).toBeNull();
  });

  it('marks critical risk as high priority', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request({ risk: 'critical' }), 'chat-1');
    expect(delivery!.priority).toBe('high');
  });

  it('marks low risk as normal priority', () => {
    const projection = new TelegramPermissionProjection();
    const delivery = projection.projectRequest(request({ risk: 'low' }), 'chat-1');
    expect(delivery!.priority).toBe('normal');
  });
});

describe('TelegramPermissionProjection.parseApprovalCallback', () => {
  it('parses approve/deny/view taps', () => {
    const projection = new TelegramPermissionProjection();
    expect(projection.parseApprovalCallback('perm:approve:apr-1')).toEqual({
      kind: 'approve',
      approvalId: 'apr-1',
    });
    expect(projection.parseApprovalCallback('perm:deny:apr-1')).toEqual({
      kind: 'deny',
      approvalId: 'apr-1',
    });
    expect(projection.parseApprovalCallback('perm:view:apr-1')).toEqual({
      kind: 'view',
      approvalId: 'apr-1',
    });
  });

  it('rejects foreign namespaces and malformed payloads', () => {
    const projection = new TelegramPermissionProjection();
    expect(projection.parseApprovalCallback(undefined)).toBeNull();
    expect(projection.parseApprovalCallback('')).toBeNull();
    expect(projection.parseApprovalCallback('exec:approve:apr-1')).toBeNull();
    expect(projection.parseApprovalCallback('perm:approve')).toBeNull();
    expect(projection.parseApprovalCallback('perm:bogus:apr-1')).toBeNull();
    expect(projection.parseApprovalCallback('perm:approve:')).toBeNull();
  });

  it('keeps callback data within 64 bytes', () => {
    const projection = new TelegramPermissionProjection();
    const longId = 'a'.repeat(100);
    const delivery = projection.projectRequest(request({ approvalId: longId }), 'chat-1');
    expect(delivery).not.toBeNull();
    const keyboard = delivery!.content.inlineKeyboard!;
    for (const row of keyboard) {
      for (const btn of row) {
        expect(new TextEncoder().encode(btn.callbackData).length).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe('TelegramPermissionProjection request tracking', () => {
  it('tracks pending requests and resolves them', () => {
    const projection = new TelegramPermissionProjection();
    projection.projectRequest(request(), 'chat-1');

    expect(projection.isPending('apr-1')).toBe(true);
    expect(projection.getPending('apr-1')?.toolName).toBe('bash');

    projection.resolveRequest('apr-1');
    expect(projection.isPending('apr-1')).toBe(false);
  });

  it('isExpired returns true for past expiry', () => {
    const projection = new TelegramPermissionProjection();
    expect(projection.isExpired(request({ expiresAt: '2020-01-01T00:00:00Z' }))).toBe(true);
    expect(projection.isExpired(request({ expiresAt: '2099-01-01T00:00:00Z' }))).toBe(false);
    expect(projection.isExpired(request())).toBe(false);
  });
});

describe('validateApprovalIntent', () => {
  it('allows intents for pending requests', () => {
    const callback = { kind: 'approve' as const, approvalId: 'apr-1' };
    const result = validateApprovalIntent(callback, () => true);
    expect(result).toEqual(callback);
  });

  it('rejects intents for unknown requests', () => {
    const callback = { kind: 'approve' as const, approvalId: 'apr-1' };
    const result = validateApprovalIntent(callback, () => false);
    expect(result).toBeNull();
  });

  it('rejects noop intents', () => {
    const callback = { kind: 'noop' as const };
    const result = validateApprovalIntent(callback, () => true);
    expect(result).toBeNull();
  });
});
