/**
 * CI-UI-003 — Provider-neutral CI read boundary.
 *
 * `GET /api/ci/status` is the single cohesive read model for the Settings →
 * Integrations → Continuous Integration surface. It projects the authoritative
 * state that currently exists:
 *
 *   - configuration metadata (credential/webhook presence, adapter version)
 *   - authoritative WorkflowTask external-verification waits (CI-OBS-002B2)
 *   - persisted decision references carried on those waits
 *
 * GitHub-specific vocabulary stays behind `@vestara/github-ci-adapter`; React
 * never calls GitHub. Observation bodies and reviewer decisions are NOT
 * persisted by any accepted store, so those sub-models remain explicitly
 * `unavailable` (HOLD) rather than fabricated.
 *
 * Security: only `configured: true|false` metadata is ever returned. Token,
 * webhook secret, installation token, and authorization header VALUES are
 * never read into the response (presence checks only, `.trim()`-gated).
 *
 * Authority: read-only. This endpoint mutates nothing and grants nothing.
 */

import type * as http from 'node:http';
import { GITHUB_CI_ADAPTER_VERSION } from '@vestara/github-ci-adapter';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

// ─── Vocabularies ───────────────────────────────────────────────────

/** Whether an authoritative read source exists for a sub-model. */
export type CIAvailability = 'available' | 'unavailable' | 'unknown';

/**
 * Connection status.
 *
 * `connected` is only emitted when connectivity has actually been verified.
 * The presence of a credential yields `configured` — never `connected`.
 */
export type CIConnectionStatus = 'connected' | 'configured' | 'unconfigured' | 'unknown' | 'error';

/** Webhook ingress health — `configured` requires a real signal, never inference. */
export type CIWebhookState = 'configured' | 'receiving' | 'error' | 'unknown';

/** Workflow action vocabulary (mirrors CI-OBS-002A; not re-declared as authority). */
export type CIVerificationAction = 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';

const VERIFICATION_ACTIONS: readonly CIVerificationAction[] = ['HOLD', 'REPAIR_CANDIDATE', 'PROCEED_TO_VERIFICATION'];

// ─── Read model ─────────────────────────────────────────────────────

export interface CIConnectionReadDto {
  readonly provider: string;
  readonly status: CIConnectionStatus;
  readonly credentialConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly adapterVersion: string;
  /** Repository identities observed on authoritative waits. */
  readonly repositories: readonly string[];
}

export interface CIObservationReadDto {
  readonly availability: CIAvailability;
  readonly reason?: string;
}

export interface CIVerificationReadDto {
  readonly availability: CIAvailability;
  readonly reason?: string;
}

export interface CIWebhookHealthReadDto {
  readonly state: CIWebhookState;
  readonly detail?: string;
  readonly lastDeliveryAt?: string;
}

export interface CICorrelationWaitReadDto {
  readonly taskId: string;
  readonly taskSummary?: string;
  readonly taskStatus?: string;
  readonly provider?: string;
  readonly repository: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly waitRef: string;
  readonly runRef?: string;
  readonly decisionRef?: string;
  /** Action parsed from the persisted decision reference suffix (closed set). */
  readonly decisionAction?: CIVerificationAction;
  readonly suspendedAt: string;
  readonly resumedAt?: string;
  readonly originatingWorkflowRunId?: string;
  readonly originatingOperationId?: string;
}

export interface CICorrelationReadDto {
  readonly availability: CIAvailability;
  readonly reason?: string;
  readonly waits: readonly CICorrelationWaitReadDto[];
}

export interface CIStatusReadDto {
  readonly provider: 'github-actions';
  readonly generatedAt: string;
  readonly availability: {
    readonly connection: CIAvailability;
    readonly observation: CIAvailability;
    readonly verification: CIAvailability;
    readonly webhookHealth: CIAvailability;
    readonly correlation: CIAvailability;
  };
  readonly connection: CIConnectionReadDto;
  readonly observation: CIObservationReadDto;
  readonly verification: CIVerificationReadDto;
  readonly webhookHealth: CIWebhookHealthReadDto;
  readonly correlation: CICorrelationReadDto;
}

export interface BuildCIStatusInput {
  readonly credentialConfigured: boolean;
  readonly webhookSecretConfigured: boolean;
  readonly adapterVersion: string;
  readonly waits: readonly CICorrelationWaitReadDto[];
  readonly correlationAvailability: CIAvailability;
  readonly correlationReason?: string;
  readonly generatedAt?: string;
}

/**
 * Parse the action suffix from a persisted decision reference of the shape
 * `${observationId}:${action}`. Returns `undefined` unless the suffix is a
 * member of the frozen action vocabulary — never invents an outcome.
 */
export function decisionActionOf(decisionRef: string | undefined): CIVerificationAction | undefined {
  if (!decisionRef) return undefined;
  const suffix = decisionRef.slice(decisionRef.lastIndexOf(':') + 1);
  return VERIFICATION_ACTIONS.find((action) => action === suffix);
}

function repositoriesOf(waits: readonly CICorrelationWaitReadDto[]): readonly string[] {
  return [...new Set(waits.map((wait) => wait.repository))];
}

function webhookHealthOf(webhookSecretConfigured: boolean): CIWebhookHealthReadDto {
  if (webhookSecretConfigured) {
    return {
      state: 'configured',
      detail: 'Webhook secret configured; no delivery read boundary is exposed yet',
    };
  }
  return {
    state: 'unknown',
    detail: 'Webhook secret is not configured; health cannot be established',
  };
}

/**
 * Build the provider-neutral read model. Pure — no IO, no authority.
 *
 * `observation`/`verification` are HOLD: no accepted store persists CI
 * observation bodies or reviewer decisions, so they are reported unavailable
 * (never fabricated as green).
 */
export function buildCIStatusReadModel(input: BuildCIStatusInput): CIStatusReadDto {
  const connection: CIConnectionReadDto = {
    provider: 'github-actions',
    // Credential presence is configuration, not verified connectivity.
    status: input.credentialConfigured ? 'configured' : 'unconfigured',
    credentialConfigured: input.credentialConfigured,
    webhookConfigured: input.webhookSecretConfigured,
    adapterVersion: input.adapterVersion,
    repositories: repositoriesOf(input.waits),
  };

  const observation: CIObservationReadDto = {
    availability: 'unavailable',
    reason: 'CI observation bodies are not persisted by an accepted read authority',
  };
  const verification: CIVerificationReadDto = {
    availability: 'unavailable',
    reason: 'Reviewer decisions are transient and have no persisted read authority',
  };

  const correlation: CICorrelationReadDto = {
    availability: input.correlationAvailability,
    ...(input.correlationReason !== undefined ? { reason: input.correlationReason } : {}),
    waits: input.waits,
  };

  return {
    provider: 'github-actions',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    availability: {
      connection: 'available',
      observation: observation.availability,
      verification: verification.availability,
      webhookHealth: 'available',
      correlation: correlation.availability,
    },
    connection,
    observation,
    verification,
    webhookHealth: webhookHealthOf(input.webhookSecretConfigured),
    correlation,
  };
}

// ─── Authoritative wait collection ──────────────────────────────────

export interface CICollectedWaits {
  readonly availability: CIAvailability;
  readonly reason?: string;
  readonly waits: readonly CICorrelationWaitReadDto[];
}

const MAX_PROJECTS = 50;

/**
 * Collect the authoritative external-verification waits from the orchestrated
 * task projections. Read-only; a failure yields an explicit unavailable state
 * rather than partial/fabricated data.
 */
export async function collectCIWaits(ctx: WorkspaceContext): Promise<CICollectedWaits> {
  try {
    const workspaceId = ctx.runtime.getSession().fingerprint.id;
    const projects = await ctx.workflowOrchestrator.listProjects(workspaceId);
    const waits: CICorrelationWaitReadDto[] = [];
    for (const project of projects.slice(0, MAX_PROJECTS)) {
      const snapshot = await ctx.workflowOrchestrator.snapshot(project.id);
      for (const task of snapshot.tasks) {
        const wait = task.externalWait;
        if (!wait) continue;
        waits.push({
          taskId: task.id,
          taskSummary: task.summary,
          taskStatus: task.status,
          ...(wait.provider !== undefined ? { provider: wait.provider } : {}),
          repository: wait.repository,
          branch: wait.branch,
          commitSha: wait.commitSha,
          waitRef: wait.waitRef,
          ...(wait.runRef !== undefined ? { runRef: wait.runRef } : {}),
          ...(wait.decisionRef !== undefined ? { decisionRef: wait.decisionRef } : {}),
          ...(decisionActionOf(wait.decisionRef) !== undefined
            ? { decisionAction: decisionActionOf(wait.decisionRef) }
            : {}),
          suspendedAt: wait.suspendedAt,
          ...(wait.resumedAt !== undefined ? { resumedAt: wait.resumedAt } : {}),
          ...(wait.originatingWorkflowRunId !== undefined
            ? { originatingWorkflowRunId: wait.originatingWorkflowRunId }
            : {}),
          ...(wait.originatingOperationId !== undefined ? { originatingOperationId: wait.originatingOperationId } : {}),
        });
      }
    }
    return { availability: 'available', waits };
  } catch (error) {
    return {
      availability: 'unavailable',
      reason: error instanceof Error ? error.message : 'The orchestration read boundary is unavailable',
      waits: [],
    };
  }
}

// ─── Route ──────────────────────────────────────────────────────────

/** Presence-only credential check — never returns or logs the value. */
function configured(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function handleCIRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (!p.startsWith('/api/ci')) return false;

  if (method === 'GET' && p === '/api/ci/status') {
    const correlation = await collectCIWaits(ctx);
    const model = buildCIStatusReadModel({
      credentialConfigured: configured(process.env.GITHUB_TOKEN),
      webhookSecretConfigured: configured(process.env.GITHUB_WEBHOOK_SECRET),
      adapterVersion: GITHUB_CI_ADAPTER_VERSION,
      waits: correlation.waits,
      correlationAvailability: correlation.availability,
      ...(correlation.reason !== undefined ? { correlationReason: correlation.reason } : {}),
    });
    json(res, 200, model);
    return true;
  }

  json(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown CI route ${p}` } });
  return true;
}
