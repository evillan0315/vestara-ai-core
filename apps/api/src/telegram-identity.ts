import {
  HumanPrincipalConflictError,
  HumanPrincipalNotFoundError,
  type HumanExternalIdentity,
  type HumanPrincipal,
  type HumanPrincipalStorage,
} from '@vestara/workspace';
import type { TelegramIdentityBinding, TelegramPairingService } from '@vestara/telegram-integration';

export const TELEGRAM_EXTERNAL_IDENTITY_PROVIDER = 'telegram';

/** Canonical identity result; it carries no membership or authorization. */
export interface ResolvedTelegramIdentity {
  readonly externalIdentity: HumanExternalIdentity;
  readonly principal: HumanPrincipal;
}

/**
 * Resolve explicit Telegram pairing evidence through the canonical principal
 * store. Missing and conflicting relationships remain unresolved.
 */
export async function resolveTelegramIdentity(
  binding: TelegramIdentityBinding | undefined,
  principals: HumanPrincipalStorage,
): Promise<ResolvedTelegramIdentity | undefined> {
  if (!binding?.active) return undefined;

  const existingPrincipal = await principals.findPrincipalByExternalIdentity(
    TELEGRAM_EXTERNAL_IDENTITY_PROVIDER,
    binding.telegramUserId,
  );
  const principal = existingPrincipal ?? (await principals.get(binding.principalId));
  if (!principal || principal.status !== 'active') return undefined;

  const externalIdentity = existingPrincipal
    ? (await principals.listExternalIdentities(principal.id)).find(
        (identity) =>
          identity.provider === TELEGRAM_EXTERNAL_IDENTITY_PROVIDER && identity.subject === binding.telegramUserId,
      )
    : await principals.linkExternalIdentity(
        principal.id,
        TELEGRAM_EXTERNAL_IDENTITY_PROVIDER,
        binding.telegramUserId,
      );

  return externalIdentity ? { externalIdentity, principal } : undefined;
}

/**
 * Explicitly enroll an already-paired Telegram subject into a selected
 * canonical principal. The selected principal is caller-supplied; no display
 * or host identity is consulted.
 */
export async function enrollTelegramIdentity(
  telegramUserId: string,
  principalId: string,
  pairing: Pick<TelegramPairingService, 'getBindingByTelegramId'>,
  principals: HumanPrincipalStorage,
): Promise<ResolvedTelegramIdentity> {
  const pairingBinding = pairing.getBindingByTelegramId(telegramUserId);
  if (!pairingBinding?.active) {
    throw new Error('Telegram user is not actively paired');
  }

  const principal = await principals.get(principalId);
  if (!principal) throw new HumanPrincipalNotFoundError(`HumanPrincipal not found: ${principalId}`);
  if (principal.status !== 'active') {
    throw new Error(`HumanPrincipal ${principalId} is not active`);
  }

  const existingPrincipal = await principals.findPrincipalByExternalIdentity(
    TELEGRAM_EXTERNAL_IDENTITY_PROVIDER,
    telegramUserId,
  );
  if (existingPrincipal && existingPrincipal.id !== principalId) {
    throw new HumanPrincipalConflictError(
      `Telegram identity ${telegramUserId} is already linked to principal ${existingPrincipal.id}`,
    );
  }

  const externalIdentity = existingPrincipal
    ? (await principals.listExternalIdentities(principalId)).find(
        (identity) => identity.provider === TELEGRAM_EXTERNAL_IDENTITY_PROVIDER && identity.subject === telegramUserId,
      )
    : await principals.linkExternalIdentity(principalId, TELEGRAM_EXTERNAL_IDENTITY_PROVIDER, telegramUserId);

  if (!externalIdentity) throw new Error('Telegram external identity binding could not be resolved');
  return { externalIdentity, principal };
}
