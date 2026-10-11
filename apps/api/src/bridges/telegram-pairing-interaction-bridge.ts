/**
 * Telegram Pairing ↔ Interaction Bridge
 *
 * Presents every Telegram `/pair` pairing request as a StructuredInteraction
 * with Approve/Reject choices so the operator can bind the account with one
 * click in the Activity Room stream — no code copy-paste into Settings.
 *
 * Authority boundaries (frozen):
 * - This bridge owns NO pairing persistence (delegates to TelegramPairingService)
 *   and NO principal governance (reads HumanPrincipalStorage read-only).
 * - A choice expresses intent only. Approve resolves the operator-selected
 *   principal the same way the manual `/api/telegram/pairing/approve`
 *   endpoint does; it never invents a principal (fail-closed when the
 *   Telegram subject has no linked canonical principal).
 * - Presentation and outcome mirrors are best-effort projections — they
 *   never fail the `/pair` command path or the response ingestion path.
 * - The pairing token never enters the interaction id (ids are Room-visible);
 *   the token travels only via the existing TG-031 Room mirror + Telegram DM.
 */

import type { EventBus } from '@vestara/event-bus';
import type { InteractionService } from '@vestara/interaction-app';
import type { VestaraEvent } from '@vestara/shared';
import type { TelegramPairingService } from '@vestara/telegram-integration';
import type { ChoiceId, InteractionId, StructuredInteraction } from '@vestara/types';
import type { HumanPrincipalStorage } from '@vestara/workspace';
import { TELEGRAM_EXTERNAL_IDENTITY_PROVIDER } from '../telegram-identity';

export const TELEGRAM_PAIRING_INTERACTION_PREFIX = 'telegram-pairing:';
export const TELEGRAM_PAIRING_APPROVE_CHOICE = 'telegram-pairing.approve';
export const TELEGRAM_PAIRING_REJECT_CHOICE = 'telegram-pairing.reject';

/** Operator-side presenter identity — matches the TG-031 Room mirror actor. */
const PAIRING_PRESENTER_ID = 'agent-assistant';
const PAIRING_PRESENTER_NAME = 'Assistant';

export interface TelegramPairingApprovalRequest {
  readonly pairingId: string;
  readonly telegramUserId: string;
  readonly telegramDisplayName: string;
  readonly token: string;
  readonly expiresAt: string;
}

export function telegramPairingInteractionId(pairingId: string): string {
  return `${TELEGRAM_PAIRING_INTERACTION_PREFIX}${encodeURIComponent(pairingId)}`;
}

/** Returns the pairing request id, or undefined when the id is not ours. */
export function parseTelegramPairingInteractionId(interactionId: string): string | undefined {
  if (!interactionId.startsWith(TELEGRAM_PAIRING_INTERACTION_PREFIX)) return undefined;
  const rest = interactionId.slice(TELEGRAM_PAIRING_INTERACTION_PREFIX.length);
  if (rest.length === 0) return undefined;
  try {
    return decodeURIComponent(rest);
  } catch {
    return undefined;
  }
}

export function buildTelegramPairingApprovalInteraction(
  request: TelegramPairingApprovalRequest,
): StructuredInteraction {
  return {
    interactionId: telegramPairingInteractionId(request.pairingId) as InteractionId,
    presentingParticipantId: PAIRING_PRESENTER_ID,
    presentingParticipantName: PAIRING_PRESENTER_NAME,
    createdAt: new Date().toISOString(),
    content:
      `Telegram pairing request\n` +
      `${request.telegramDisplayName} (${request.telegramUserId})\n` +
      `Code: ${request.token} (expires ${request.expiresAt})\n` +
      `Approve to bind this Telegram account, Reject to cancel the request.`,
    choices: [
      { choiceId: TELEGRAM_PAIRING_APPROVE_CHOICE as ChoiceId, label: 'Approve' },
      { choiceId: TELEGRAM_PAIRING_REJECT_CHOICE as ChoiceId, label: 'Reject' },
    ],
  };
}

/**
 * Present the approval interaction. Idempotent (skips when already
 * presented) and fail-closed (false on any error — the `/pair` command
 * path must never break because the Room is unavailable).
 */
export async function presentTelegramPairingApproval(
  interactionService: Pick<InteractionService, 'getInteraction' | 'present'>,
  request: TelegramPairingApprovalRequest,
): Promise<boolean> {
  try {
    const interactionId = telegramPairingInteractionId(request.pairingId) as InteractionId;
    const existing = await interactionService.getInteraction(interactionId);
    if (existing?.interaction) return false;
    await interactionService.present(buildTelegramPairingApprovalInteraction(request), {
      correlationId: interactionId,
    });
    return true;
  } catch {
    return false;
  }
}

export interface TelegramPairingInteractionBridgeOptions {
  readonly eventBus: EventBus;
  readonly interactionService: InteractionService;
  readonly pairing: Pick<TelegramPairingService, 'getPairingRequestById' | 'approvePairing' | 'cancelPairingRequest'>;
  readonly principals: Pick<HumanPrincipalStorage, 'findPrincipalByExternalIdentity'>;
  /** Room projection callback (TG-031 mirror). Must never throw. */
  readonly mirror: (text: string) => void;
  readonly logger?: { warn(message: string): void; info(message: string): void };
}

export function createTelegramPairingInteractionBridge(options: TelegramPairingInteractionBridgeOptions): {
  dispose: () => void;
} {
  const onInteractionResponded = async (event: VestaraEvent): Promise<void> => {
    const interactionId = typeof event.payload.interactionId === 'string' ? event.payload.interactionId : undefined;
    if (!interactionId) return;
    const pairingId = parseTelegramPairingInteractionId(interactionId);
    if (!pairingId) return;

    const persisted = await options.interactionService.getResponse(interactionId as InteractionId);
    if (!persisted) return;

    const request = options.pairing.getPairingRequestById(pairingId);
    if (!request || request.status !== 'pending') {
      options.mirror(
        `Telegram pairing ${pairingId} is no longer pending — no action taken (it may already be approved or expired).`,
      );
      return;
    }
    const who = `${request.telegramDisplayName} (${request.telegramUserId})`;

    if (persisted.response.selectedChoiceId === TELEGRAM_PAIRING_APPROVE_CHOICE) {
      let principalId: string | undefined;
      try {
        const principal = await options.principals.findPrincipalByExternalIdentity(
          TELEGRAM_EXTERNAL_IDENTITY_PROVIDER,
          request.telegramUserId,
        );
        principalId = principal?.id;
      } catch (error) {
        options.logger?.warn(
          `telegram pairing principal lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!principalId) {
        options.mirror(
          `Pairing approval for ${who} needs a canonical principal — no Telegram-linked principal found. ` +
            `Approve via Settings → Telegram with code ${request.token}.`,
        );
        return;
      }
      try {
        options.pairing.approvePairing(request.token, principalId, request.telegramDisplayName);
        options.logger?.info(`paired Telegram ${request.telegramUserId} to ${principalId} via Room approval`);
        options.mirror(`Paired ${who} to principal ${principalId} — they can message the bot now.`);
      } catch (error) {
        options.mirror(`Pairing approval for ${who} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    if (persisted.response.selectedChoiceId === TELEGRAM_PAIRING_REJECT_CHOICE) {
      const cancelled = options.pairing.cancelPairingRequest(pairingId);
      options.logger?.info(`rejected Telegram pairing ${pairingId} via Room`);
      options.mirror(
        `Pairing request for ${who} rejected${cancelled ? ' — they can /pair again for a fresh code' : ''}.`,
      );
    }
  };

  const unsubscribe = options.eventBus.subscribe('interaction:responded', (event) =>
    onInteractionResponded(event).catch((error) =>
      options.logger?.warn(
        `telegram pairing response failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ),
  );

  return {
    dispose() {
      unsubscribe();
    },
  };
}
