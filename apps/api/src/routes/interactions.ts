/**
 * AR-REC-C2 I2-I1: Structured Interaction Response HTTP Ingress
 *
 * Domain-neutral HTTP boundary for recording human interaction responses.
 * Delegates to the frozen InteractionService application boundary.
 *
 * Route: POST /api/interactions/:interactionId/responses
 *
 * Identity flow:
 *   HTTP request → authenticate → AuthUser.id/name → server-derived participant identity
 *
 * Response flow:
 *   client { choiceId } → validate → InteractionService.recordResponse() → durable fact
 *
 * Semantic mapping:
 *   first valid response      → 201 Created
 *   same-choice retry         → 200 OK (existing authoritative response)
 *   different-choice conflict → 409 Conflict
 *
 * The endpoint MUST NOT interpret what a choiceId means or cause domain execution.
 */

import { randomUUID } from 'node:crypto';
import type * as http from 'node:http';
import * as path from 'node:path';
import { M9DeliveryVerifier } from '@vestara/activity-room';
import { InteractionService, ResponseConflictError } from '@vestara/interaction-app';
import { InteractionEventBusAdapter, SqliteInteractionStore } from '@vestara/interaction-persistence';
import type { ChoiceId, InteractionId, InteractionResponse } from '@vestara/types';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getM11ARoom } from './activity-room-m11a';
import { json, readBody } from './types';

// ─── Lazy Singleton ─────────────────────────────────────────

let interactionService: InteractionService | null = null;
let interactionServiceRepoPath: string | null = null;

async function getInteractionService(ctx: WorkspaceContext): Promise<InteractionService> {
  if (interactionService && interactionServiceRepoPath === ctx.repoPath) return interactionService;

  const dbPath = path.join(ctx.repoPath, '.vestara', 'interactions.db');
  const store = await SqliteInteractionStore.open(dbPath);
  const adapter = new InteractionEventBusAdapter(ctx.eventBus);

  // C2: Delivery verifier checks M9 before acknowledging publication
  let verifier: import('@vestara/interaction-persistence').PublicationDeliveryVerifier | undefined;
  try {
    const m9Store = getM11ARoom().store;
    verifier = new M9DeliveryVerifier(m9Store);
  } catch {
    // M11A not initialized — proceed without verifier (legacy behavior)
  }

  interactionService = new InteractionService({
    persistence: store,
    publication: adapter,
    deliveryVerifier: verifier,
  });
  interactionServiceRepoPath = ctx.repoPath;
  return interactionService;
}

// ─── Route Handler ──────────────────────────────────────────

export async function handleInteractionsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // Route: POST /api/interactions/:interactionId/responses
  const match = p.match(/^\/api\/interactions\/([^/]+)\/responses$/);
  if (!match || method !== 'POST') return false;

  const interactionId = decodeURIComponent(match[1] as string) as InteractionId;

  // Auth: existing requireRole guard (editor minimum for mutation)
  const actor = requireRole(req, ctx, 'editor', res);
  if (!actor) return true;

  // Body validation — strict allowlist: exactly { "choiceId": "..." }
  let body: unknown;
  try {
    body = await readBody(req);
    body = body ? JSON.parse(body as string) : {};
  } catch {
    json(res, 400, { error: 'Request body is not valid JSON.' });
    return true;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    json(res, 400, { error: 'Request body must be a JSON object.' });
    return true;
  }

  const bodyKeys = Object.keys(body as Record<string, unknown>);
  if (bodyKeys.length !== 1 || !('choiceId' in (body as Record<string, unknown>))) {
    json(res, 400, { error: 'Request body must contain exactly { "choiceId": "..." }' });
    return true;
  }

  const choiceId = (body as Record<string, unknown>).choiceId;
  if (typeof choiceId !== 'string' || !choiceId.trim()) {
    json(res, 400, { error: 'choiceId is required' });
    return true;
  }

  // Construct server-derived InteractionResponse
  const response: InteractionResponse = {
    responseId: randomUUID() as InteractionResponse['responseId'],
    interactionId,
    selectedChoiceId: choiceId.trim() as ChoiceId,
    respondingParticipantId: actor.id,
    respondingParticipantName: actor.name,
    respondedAt: new Date().toISOString(),
  };

  // Delegate to frozen InteractionService
  try {
    const service = await getInteractionService(ctx);
    const result = await service.recordResponse(interactionId, response);

    // Same-choice retry returns existing response — 200 (idempotent)
    // First response returns new response — 201
    // Distinguish by comparing responseId
    if (result.responseId === response.responseId) {
      json(res, 201, { response: result });
    } else {
      json(res, 200, { response: result });
    }
    return true;
  } catch (err) {
    if (err instanceof ResponseConflictError) {
      json(res, 409, { error: 'Response already recorded for this interaction' });
      return true;
    }
    if (err instanceof Error && err.message.startsWith('Interaction not found')) {
      json(res, 404, { error: 'Interaction not found' });
      return true;
    }
    if (err instanceof Error && err.message.startsWith('Response validation failed')) {
      json(res, 400, { error: err.message });
      return true;
    }
    json(res, 500, { error: 'Internal error' });
    return true;
  }
}
