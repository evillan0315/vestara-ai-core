/**
 * Telegram pairing ↔ Interaction bridge tests.
 *
 * Proves the one-click Room approval contract:
 * - every /pair request builds an Approve/Reject interaction (idempotent),
 * - Approve binds only a canonical linked principal (fail-closed otherwise),
 * - Reject cancels the pending request so the user can /pair again,
 * - unrelated interactions and settled requests are ignored, never throw.
 */

import type { EventBus } from '@vestara/event-bus';
import type { InteractionService } from '@vestara/interaction-app';
import type { VestaraEvent } from '@vestara/shared';
import { TelegramPairingService } from '@vestara/telegram-integration';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTelegramPairingApprovalInteraction,
  createTelegramPairingInteractionBridge,
  parseTelegramPairingInteractionId,
  presentTelegramPairingApproval,
  TELEGRAM_PAIRING_APPROVE_CHOICE,
  TELEGRAM_PAIRING_REJECT_CHOICE,
  type TelegramPairingApprovalRequest,
  telegramPairingInteractionId,
} from '../src/bridges/telegram-pairing-interaction-bridge';

function approvalRequest(pairingId = 'pair-1'): TelegramPairingApprovalRequest {
  return {
    pairingId,
    telegramUserId: 'tg-user-9',
    telegramDisplayName: 'Room User',
    token: 'ROOMCODE1',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

function respondedEvent(interactionId: string): VestaraEvent {
  return { type: 'interaction:responded', payload: { interactionId } } as unknown as VestaraEvent;
}

interface CapturedHandler {
  pattern: string;
  handler: (event: VestaraEvent) => void;
}

function fakeBus(captured: CapturedHandler[]): EventBus {
  return {
    subscribe: (pattern: string, handler: (event: VestaraEvent) => void) => {
      captured.push({ pattern, handler });
      return () => undefined;
    },
  } as unknown as EventBus;
}

function respondWith(choiceId: string) {
  return { response: { selectedChoiceId: choiceId } };
}

describe('telegram pairing interaction ids', () => {
  it('round-trips the pairing id and rejects foreign ids', () => {
    expect(parseTelegramPairingInteractionId(telegramPairingInteractionId('pair-abc'))).toBe('pair-abc');
    expect(parseTelegramPairingInteractionId('workflow-approval:a:b:1')).toBeUndefined();
    expect(parseTelegramPairingInteractionId('telegram-pairing:')).toBeUndefined();
  });

  it('builds an Approve/Reject interaction without executable semantics', () => {
    const interaction = buildTelegramPairingApprovalInteraction(approvalRequest('pair-7'));
    expect(interaction.interactionId).toBe(telegramPairingInteractionId('pair-7'));
    expect(interaction.choices.map((c) => c.choiceId)).toEqual([
      TELEGRAM_PAIRING_APPROVE_CHOICE,
      TELEGRAM_PAIRING_REJECT_CHOICE,
    ]);
    expect(interaction.content).toContain('ROOMCODE1');
    expect(interaction.content).toContain('Room User');
  });
});

describe('presentTelegramPairingApproval', () => {
  it('presents once and skips when already presented', async () => {
    const presented: string[] = [];
    const service = {
      getInteraction: async () => undefined,
      present: async (interaction: { interactionId: string }) => {
        presented.push(interaction.interactionId);
      },
    };
    expect(await presentTelegramPairingApproval(service, approvalRequest('pair-a'))).toBe(true);
    expect(presented).toHaveLength(1);

    const existing = {
      getInteraction: async () => ({ interaction: { interactionId: 'x' } }),
      present: async () => {
        throw new Error('must not present twice');
      },
    };
    expect(await presentTelegramPairingApproval(existing, approvalRequest('pair-a'))).toBe(false);
  });

  it('fails closed (false) when presentation throws', async () => {
    const service = {
      getInteraction: async () => undefined,
      present: async () => {
        throw new Error('room unavailable');
      },
    };
    expect(await presentTelegramPairingApproval(service, approvalRequest('pair-b'))).toBe(false);
  });
});

describe('createTelegramPairingInteractionBridge', () => {
  let pairing: TelegramPairingService;
  let mirrors: string[];
  let captured: CapturedHandler[];
  let responses: Map<string, { response: { selectedChoiceId: string } }>;

  beforeEach(() => {
    pairing = new TelegramPairingService();
    mirrors = [];
    captured = [];
    responses = new Map();
  });

  function bridgeWith(principalId: string | undefined) {
    const interactionService = {
      getResponse: async (interactionId: string) => responses.get(interactionId),
    } as unknown as InteractionService;
    const principals = {
      findPrincipalByExternalIdentity: async () => (principalId ? { id: principalId } : undefined),
    };
    return createTelegramPairingInteractionBridge({
      eventBus: fakeBus(captured),
      interactionService,
      pairing,
      principals: principals as never,
      mirror: (text: string) => {
        mirrors.push(text);
      },
    });
  }

  async function emit(interactionId: string): Promise<void> {
    const entry = captured.find((c) => c.pattern === 'interaction:responded');
    expect(entry).toBeDefined();
    await entry?.handler(respondedEvent(interactionId));
  }

  it('approves a pending request against the linked canonical principal', async () => {
    const request = pairing.createPairingRequest('tg-user-9', 'Room User');
    const interactionId = telegramPairingInteractionId(request.id);
    responses.set(interactionId, respondWith(TELEGRAM_PAIRING_APPROVE_CHOICE));

    const bridge = bridgeWith('hp-room-1');
    await emit(interactionId);

    expect(pairing.isPaired('tg-user-9')).toBe(true);
    expect(pairing.resolvePrincipalId('tg-user-9')).toBe('hp-room-1');
    expect(mirrors.join('\n')).toContain('Paired');
    bridge.dispose();
  });

  it('refuses approval when no canonical principal is linked (fail-closed)', async () => {
    const request = pairing.createPairingRequest('tg-user-9', 'Room User');
    const interactionId = telegramPairingInteractionId(request.id);
    responses.set(interactionId, respondWith(TELEGRAM_PAIRING_APPROVE_CHOICE));

    const bridge = bridgeWith(undefined);
    await emit(interactionId);

    expect(pairing.isPaired('tg-user-9')).toBe(false);
    expect(mirrors.join('\n')).toContain('canonical principal');
    bridge.dispose();
  });

  it('rejects by cancelling the pending request so the user can /pair again', async () => {
    const request = pairing.createPairingRequest('tg-user-9', 'Room User');
    const interactionId = telegramPairingInteractionId(request.id);
    responses.set(interactionId, respondWith(TELEGRAM_PAIRING_REJECT_CHOICE));

    const bridge = bridgeWith('hp-room-1');
    await emit(interactionId);

    expect(pairing.getPairingRequestById(request.id)).toBeUndefined();
    expect(mirrors.join('\n')).toContain('rejected');
    // A fresh /pair works immediately (no pending-limit block).
    expect(() => pairing.createPairingRequest('tg-user-9', 'Room User')).not.toThrow();
    bridge.dispose();
  });

  it('ignores unrelated interactions and settled requests without throwing', async () => {
    const bridge = bridgeWith('hp-room-1');
    await emit('workflow-approval:p:t:1');
    expect(mirrors).toHaveLength(0);

    // Settled via the manual endpoint first — the Room answer is a no-op notice.
    const request = pairing.createPairingRequest('tg-user-9', 'Room User');
    pairing.approvePairing(request.token, 'hp-room-1', 'Room User');
    const interactionId = telegramPairingInteractionId(request.id);
    responses.set(interactionId, respondWith(TELEGRAM_PAIRING_APPROVE_CHOICE));
    await emit(interactionId);
    expect(mirrors.join('\n')).toContain('no longer pending');
    bridge.dispose();
  });
});

describe('TelegramPairingService request lookup (bridge support)', () => {
  it('gets by id and cancels only pending requests', () => {
    const pairing = new TelegramPairingService();
    const request = pairing.createPairingRequest('tg-u', 'U');
    expect(pairing.getPairingRequestById(request.id)?.token).toBe(request.token);
    expect(pairing.getPairingRequestById('missing')).toBeUndefined();
    expect(pairing.cancelPairingRequest('missing')).toBe(false);

    expect(pairing.cancelPairingRequest(request.id)).toBe(true);
    expect(pairing.getPairingRequestById(request.id)).toBeUndefined();

    const second = pairing.createPairingRequest('tg-u', 'U');
    pairing.approvePairing(second.token, 'hp-1', 'U');
    expect(pairing.cancelPairingRequest(second.id)).toBe(false);
  });
});
