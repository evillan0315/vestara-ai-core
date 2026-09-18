/**
 * AR-UI-REPLY-002: Authoritative conversation provenance extraction.
 *
 * Single canonical reader for Conversation Runtime provenance carried by
 * durable M9 events. Consumed by `toProjectionRecord` (M11B/live path) and
 * the M10 `ProjectionRuntime` (M11A/snapshot path) so both projections
 * preserve exactly the same provenance.
 *
 * Sources (durable event provenance ONLY):
 * - `payload.conversationId`: `human.message` top-level shape written by
 *   `fromHumanMessage` (Conversation `conversation:message.sent` event).
 * - `payload.data.conversationId`: `agent.completed` shape written by the
 *   M9 ingestion bridge (`conversation:response.completed` event).
 * - `payload.data.surface`: sending-surface attribution written by
 *   `fromHumanMessage` (Conversation `SendOptions.surface` vocabulary).
 *
 * NEVER derived from: actor, agentId, displayName, message content, icons,
 * or any presentation metadata. Non-string / blank / overlong values are
 * dropped (fail closed → unknown origin).
 */

import type { ActivityPayload } from './m9-types';

/** Defensive bound: Conversation Runtime ids and surface tags are short. */
const PROVENANCE_MAX_LENGTH = 256;

function asProvenanceString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > PROVENANCE_MAX_LENGTH) return undefined;
  return trimmed;
}

export interface OriginProvenance {
  readonly originConversationId?: string;
  readonly originSurface?: string;
}

/**
 * Extract authoritative origin provenance from an M9 activity payload.
 * Returns only the fields present; no unrelated M9 fields are promoted.
 */
export function extractOriginProvenance(payload: ActivityPayload | undefined): OriginProvenance {
  if (!payload) return {};
  const data = (payload.data ?? {}) as Readonly<Record<string, unknown>>;
  const top = payload as Readonly<Record<string, unknown>>;
  const originConversationId = asProvenanceString(top.conversationId) ?? asProvenanceString(data.conversationId);
  const originSurface = asProvenanceString(data.surface);
  return {
    ...(originConversationId ? { originConversationId } : {}),
    ...(originSurface ? { originSurface } : {}),
  };
}
