/**
 * CI-UI-003 — Read-model → view mapping.
 *
 * Mirrors the provider-neutral `GET /api/ci/status` response and maps it into
 * the reusable CI view state. The UI makes ONE request; it never talks to
 * GitHub. GitHub-specific vocabulary stays behind the API/adapter boundary.
 *
 * Honesty rules:
 *   - Observation bodies / reviewer decisions with no persisted read authority
 *     map to `unavailable` (HOLD).
 *   - A persisted decision reference maps to an action only when its suffix is
 *     a member of the frozen action vocabulary.
 *   - Credential presence is `configured`, never `connected`.
 */

import type { CIGitHubConnectionView, GitHubConnectionStatus } from './CIConnectionCard.js';
import type { CIGitHubCIView, CIWaitProjection, CIVestaraVerificationView, CIWebhookHealthView } from './ci-view-model.js';

// ─── DTOs (mirror apps/api/src/routes/ci.ts) ────────────────────────

export type CIAvailabilityDto = 'available' | 'unavailable' | 'unknown';
export type CIVerificationActionDto = 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';
export type CIWebhookStateDto = 'configured' | 'receiving' | 'error' | 'unknown';

export interface CIStatusResponse {
  readonly provider: string;
  readonly generatedAt: string;
  readonly availability: {
    readonly connection: CIAvailabilityDto;
    readonly observation: CIAvailabilityDto;
    readonly verification: CIAvailabilityDto;
    readonly webhookHealth: CIAvailabilityDto;
    readonly correlation: CIAvailabilityDto;
  };
  readonly connection: {
    readonly provider: string;
    readonly status: GitHubConnectionStatus;
    readonly credentialConfigured: boolean;
    readonly webhookConfigured: boolean;
    readonly adapterVersion: string;
    readonly repositories: readonly string[];
  };
  readonly observation: { readonly availability: CIAvailabilityDto; readonly reason?: string };
  readonly verification: { readonly availability: CIAvailabilityDto; readonly reason?: string };
  readonly webhookHealth: { readonly state: CIWebhookStateDto; readonly detail?: string; readonly lastDeliveryAt?: string };
  readonly correlation: {
    readonly availability: CIAvailabilityDto;
    readonly reason?: string;
    /** Count of unresolved waits past their deadline (H7). */
    readonly staleCount?: number;
    readonly waits: readonly CIWaitProjection[];
  };
}

// ─── Mapping ────────────────────────────────────────────────────────

export interface CIStatusView {
  readonly connection: CIGitHubConnectionView;
  readonly github: CIGitHubCIView;
  readonly verification: CIVestaraVerificationView;
  readonly webhook: CIWebhookHealthView;
  readonly waits: readonly CIWaitProjection[];
  readonly correlationAvailability: CIAvailabilityDto;
  readonly correlationReason?: string;
  /** Unresolved waits past their deadline. */
  readonly staleWaitCount: number;
}

/** Disposition of a persisted decision action (frozen action vocabulary). */
function dispositionFromPersistedAction(
  action: CIVerificationActionDto | undefined,
): CIVestaraVerificationView['disposition'] {
  switch (action) {
    case 'PROCEED_TO_VERIFICATION':
      return 'pending-verification';
    case 'REPAIR_CANDIDATE':
      return 'repair-candidate';
    case 'HOLD':
      return 'hold';
    default:
      return 'unavailable';
  }
}

/**
 * Surface the latest persisted verification reference among the waits.
 *
 * Only the action (parsed from the decision reference) and the reference/time
 * are persisted; verdict and classification have no read authority, so they
 * stay undefined rather than being invented.
 */
function verificationFromWaits(waits: readonly CIWaitProjection[]): CIVestaraVerificationView {
  const latest = waits.find((wait) => wait.decisionRef !== undefined) ?? waits.find((wait) => wait.resumedAt !== undefined);
  const action = latest ? decisionActionOf(latest.decisionRef) : undefined;
  if (!latest || (!action && !latest.resumedAt)) {
    return {
      availability: 'unavailable',
      disposition: 'unavailable',
      reason: 'Reviewer decisions are not persisted by an accepted read authority',
    };
  }
  return {
    availability: 'available',
    disposition: dispositionFromPersistedAction(action),
    ...(action !== undefined ? { action } : {}),
    ...(latest.decisionRef !== undefined ? { decisionRef: latest.decisionRef } : {}),
    ...(latest.resumedAt !== undefined ? { decidedAt: latest.resumedAt } : {}),
  };
}

export function decisionActionOf(decisionRef: string | undefined): CIVerificationActionDto | undefined {
  if (!decisionRef) return undefined;
  const suffix = decisionRef.slice(decisionRef.lastIndexOf(':') + 1);
  return (['HOLD', 'REPAIR_CANDIDATE', 'PROCEED_TO_VERIFICATION'] as const).find((action) => action === suffix);
}

/** Map the provider-neutral response into reusable CI view state. */
export function viewFromCIStatus(response: CIStatusResponse): CIStatusView {
  return {
    connection: {
      status: response.connection.status,
      tokenConfigured: response.connection.credentialConfigured,
      adapterVersion: response.connection.adapterVersion,
      repositories: response.connection.repositories,
    },
    github: {
      availability: response.observation.availability,
      ...(response.observation.reason !== undefined ? { reason: response.observation.reason } : {}),
    },
    verification: verificationFromWaits(response.correlation.waits),
    webhook: {
      state: response.webhookHealth.state,
      signatureConfigured: response.connection.webhookConfigured,
      ...(response.webhookHealth.detail !== undefined ? { detail: response.webhookHealth.detail } : {}),
      ...(response.webhookHealth.lastDeliveryAt !== undefined
        ? { lastDeliveryAt: response.webhookHealth.lastDeliveryAt }
        : {}),
    },
    waits: response.correlation.waits,
    correlationAvailability: response.correlation.availability,
    ...(response.correlation.reason !== undefined ? { correlationReason: response.correlation.reason } : {}),
    staleWaitCount:
      response.correlation.staleCount ??
      response.correlation.waits.filter((wait) => wait.deadline?.state === 'stale').length,
  };
}
