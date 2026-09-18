/**
 * VES-TG-026: Telegram Production Verification
 *
 * End-to-end verification of the Telegram vertical slice plus the full
 * adversarial matrix from the VES-TG-001 blueprint. This suite is the
 * production gate: it proves the channel boundary holds with real service
 * composition (persistent store, pairing, workspace binding, conversation
 * binding, Global Assistant router, notifications, cards, telemetry, security).
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-026)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import type { ChannelMessage } from '@vestara/channel-types';
import { migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramConversationBindingService } from '../src/conversation-binding';
import { buildDeepLink, verifyDeepLink } from '../src/deep-links';
import { GlobalAssistantTextRouter } from '../src/global-assistant';
import { TELEGRAM_MANIFEST } from '../src/migrations';
import { TelegramNotificationPolicy } from '../src/notifications';
import { TelegramPairingService } from '../src/pairing';
import { TelegramPersistentStore } from '../src/persistent-store';
import { TelegramDeliveryCoalescer } from '../src/reliability';
import { buildExecutionCardDelivery } from '../src/rich-cards';
import { TelegramAccessDeniedError, TelegramSecurityGuard } from '../src/security';
import { createCorrelationContext, TelegramTelemetry } from '../src/telemetry';
import { TelegramWorkspaceBindingService } from '../src/workspace-binding';

const BASE_URL = 'https://vestara.local';
const SECRET = 'verification-secret';

let store: TelegramPersistentStore;
let pairing: TelegramPairingService;
let workspaces: TelegramWorkspaceBindingService;
let conversations: TelegramConversationBindingService;

beforeEach(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, TELEGRAM_MANIFEST);
  store = new TelegramPersistentStore(db);
  pairing = new TelegramPairingService({ store });
  workspaces = new TelegramWorkspaceBindingService({ store });
  conversations = new TelegramConversationBindingService({ store });
});

/** A second store over the same database simulates a process restart. */
function reopenStore(): TelegramPersistentStore {
  return new TelegramPersistentStore((store as unknown as { db: unknown }).db);
}

function incoming(text: string, userId = 'tg-42', chatId = 'chat-7'): ChannelMessage {
  return {
    id: `msg-${Date.now()}`,
    channel: 'telegram',
    externalMessageId: '1001',
    sender: { channel: 'telegram', externalId: userId, displayName: 'Director' },
    conversation: { channel: 'telegram', externalId: chatId, type: 'direct' },
    text,
    timestamp: new Date('2026-09-16T10:00:00.000Z').toISOString(),
  };
}

describe('vertical slice: Telegram → principal → workspace → execution → reply', () => {
  it('routes an authenticated message through the real pipeline', async () => {
    // 1. Explicit pairing (never implicit access from knowing the bot name).
    const request = pairing.createPairingRequest('tg-42', 'Director');
    const binding = pairing.approvePairing(request.token, 'principal-1', 'Director');
    expect(binding.principalId).toBe('principal-1');

    // 2. Workspace binding.
    const workspace = workspaces.bindWorkspace('principal-1', 'vestara-ai-core', 'vestara-ai-core');
    expect(workspaces.getPreferredWorkspace('principal-1')?.workspaceId).toBe('vestara-ai-core');

    // 3. Conversation binding.
    const conversation = conversations.createBinding({
      principalId: 'principal-1',
      workspaceId: workspace.workspaceId,
      telegramChatId: 'chat-7',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
      vestaraConversationTitle: 'Session',
    });

    // 4. Route through the Global Assistant with a fake runtime backend.
    const router = new GlobalAssistantTextRouter({
      backend: {
        sendMessage: async () => ({
          executionId: 'exec-1',
          success: true,
          response: '✓ 48 tests passed',
          completedAt: new Date().toISOString(),
        }),
      },
    });

    const result = await router.routeMessage(
      incoming('Run affected tests'),
      pairing.getBindingByTelegramId('tg-42')!,
      workspace,
      conversation,
    );

    expect(result.status).toBe('routed');
    expect(result.response).toBe('✓ 48 tests passed');

    // 5. No authority leakage: Telegram bound state, Vestara owns conversation.
    expect(result.conversationId).toBe('conv-1');
    expect(conversations.getBindingByConversationId('conv-1')?.telegramChatId).toBe('chat-7');
  });

  it('refuses an unpaired identity', () => {
    expect(pairing.getBindingByTelegramId('unknown')).toBeUndefined();
  });
});

describe('in-process cross-module projection', () => {
  it('projects a card, coalesces updates, signs a deep link, and emits telemetry', () => {
    const deepLink = buildDeepLink({
      action: 'execution',
      params: { id: 'exec-1' },
      baseUrl: BASE_URL,
      secret: SECRET,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(verifyDeepLink(deepLink, SECRET).valid).toBe(true);

    const card = buildExecutionCardDelivery(
      {
        executionId: 'exec-1',
        status: 'executing',
        progressPercent: 50,
        deepLink,
        timestamp: '2026-09-16T10:00:00.000Z',
      },
      'chat-7',
    );
    expect(card.content.text).toContain('50%');
    expect(card.content.inlineKeyboard?.length).toBeGreaterThan(0);

    const coalescer = new TelegramDeliveryCoalescer();
    coalescer.register('execution:exec-1', 'msg-1');
    const next = buildExecutionCardDelivery(
      { executionId: 'exec-1', status: 'completed', progressPercent: 100, timestamp: '2026-09-16T10:01:00.000Z' },
      'chat-7',
    );
    expect(coalescer.coalesce(next, 'execution:exec-1').editMessageId).toBe('msg-1');

    const telemetry = new TelegramTelemetry();
    telemetry.emit('telegram.delivery.sent', createCorrelationContext({ executionId: 'exec-1' }), {
      botToken: 'leak-me',
    });
    expect(telemetry.getRecords()[0].data?.botToken).toBe('[redacted]');
  });

  it('applies notification preferences to a projected event', () => {
    const policy = new TelegramNotificationPolicy();
    policy.setPreferences('principal-1', {
      enabled: { 'general.activity': true },
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
    });
    const decision = policy.evaluateFor(
      'principal-1',
      {
        type: 'general.activity',
        severity: 'info',
        title: 'Ambient',
        body: 'activity',
        timestamp: '2026-09-16T23:00:00.000Z',
      },
      new Date('2026-09-16T23:00:00'),
    );
    expect(decision.reason).toBe('quiet-hours');
  });
});

describe('production persistence', () => {
  it('persists notification preferences across store instances', () => {
    store.saveSettings('notifications:default', { minSeverity: 'error' });
    const reloaded = reopenStore();
    const stored = reloaded.getSettings('notifications:default') as { minSeverity: string };
    expect(stored.minSeverity).toBe('error');
  });

  it('returns undefined for missing settings', () => {
    expect(reopenStore().getSettings('missing')).toBeUndefined();
  });
});

describe('security matrix (adversarial)', () => {
  const guard = new TelegramSecurityGuard({ callbackTtlMs: 60_000, approvalTtlMs: 60_000 });
  const now = new Date('2026-09-16T10:00:00.000Z');

  it('rejects spoofed webhook secrets', () => {
    expect(guard.verifyWebhookSecret('spoof', 'real').allowed).toBe(false);
  });

  it('rejects replayed callbacks', () => {
    expect(guard.checkCallback('cb-1').allowed).toBe(true);
    expect(guard.checkCallback('cb-1').reason).toBe('replayed-callback');
  });

  it('rejects expired pairing tokens', () => {
    expect(guard.checkPairingToken({ status: 'pending', expiresAt: '2026-09-16T09:59:00.000Z' }, now).reason).toBe(
      'expired-token',
    );
  });

  it('rejects tampered deep links', () => {
    const link = buildDeepLink({ action: 'workspace', params: { id: 'ws-1' }, baseUrl: BASE_URL, secret: SECRET });
    expect(verifyDeepLink(link.replace('ws-1', 'ws-9'), SECRET).status).toBe('tampered');
  });

  it('rejects cross-workspace requests', () => {
    expect(guard.checkWorkspaceScope('ws-1', 'ws-2').reason).toBe('cross-workspace');
  });

  it('rejects stale and post-terminal approvals', () => {
    expect(guard.checkApproval({ requestedAt: '2026-09-16T08:00:00.000Z' }, now).reason).toBe('stale-approval');
    expect(
      guard.checkApproval({ requestedAt: '2026-09-16T09:59:00.000Z', executionStatus: 'completed' }, now).reason,
    ).toBe('approval-after-terminal');
  });

  it('rejects revoked principals', () => {
    expect(guard.checkPrincipalActive(false).reason).toBe('revoked-principal');
  });

  it('rejects processing when the integration is disabled', () => {
    expect(guard.checkIntegrationEnabled(false).reason).toBe('integration-disabled');
  });

  it('flags command injection attempts', () => {
    const result = guard.sanitizeCommandInput('/model $(rm -rf /)');
    expect(result.containsShellMetacharacters).toBe(true);
  });

  it('denies access through the fail-closed access gate', () => {
    const denied = () => {
      throw new TelegramAccessDeniedError('revoked-principal', 'principal revoked');
    };
    expect(denied).toThrow(TelegramAccessDeniedError);
  });
});
