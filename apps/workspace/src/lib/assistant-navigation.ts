/**
 * AR-UI-REPLY-001/002 — Source-aware Activity Reply navigation coordinator.
 *
 * Activity Room requests "open conversation <conversationId> on the owning
 * surface" through the existing `open-assistant` window event. It never
 * imports Global Assistant internals and never infers origin from
 * presentation (display text, agent name, icon, message content).
 *
 * Authority rule (AR-UI-REPLY-002: canonical projected provenance):
 * - The stream item's `originConversationId` (Conversation Runtime
 *   `Conversation.id`, projected from durable M9 `payload.[data.]conversationId`)
 *   plus `originSurface` (canonical `surface` attribution vocabulary) decide.
 * - `originConversationId` present with NO `originSurface` attestation →
 *   Global Assistant provenance → open the existing conversation.
 *   (The Assistant composer sends no `surface` string; Activity Room
 *   composer turns attest theirs, e.g. 'workspace-ui'.)
 * - `originSurface` present (Activity Room mirror, Telegram, any future
 *   surface) → that surface owns the reply → Reply stays local (only the
 *   Global Assistant surface is implemented in this milestone).
 * - No `originConversationId` (missing/unknown) → local Activity Room
 *   composer path (fail safe, fail closed).
 *
 * Architectural identities preserved:
 * - Message identity != surface identity
 * - Conversation identity != agent identity
 * - Reply intent != new conversation (this module never creates one)
 * - Activity Room != conversation authority (Conversation Runtime owns it)
 * - Global Assistant surface != Assistant identity
 */

/** Window event the Global Assistant already listens for (reused, not new). */
export const OPEN_ASSISTANT_EVENT = 'open-assistant';

/**
 * Canonical provenance a stream item carries (AR-UI-REPLY-002 projection
 * contract: `ActivityBase` / `StreamItem` / M11A / M11C). All fields are
 * optional; absence means "unknown origin".
 *
 * Deliberately NOT consulted: `actor`, `agentId`, `displayName`, `content`,
 * `kind`, icons, effect labels, or any presentation text.
 */
export interface AssistantProvenanceCarrier {
  /** Conversation Runtime `Conversation.id` (durable M9 provenance). */
  readonly originConversationId?: unknown;
  /** Sending-surface attribution (canonical `surface` string vocabulary). */
  readonly originSurface?: unknown;
}

/** Upper bound for a Conversation Runtime id (defensive, never trust the wire). */
const CONVERSATION_ID_MAX_LENGTH = 256;

function asProvenanceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > CONVERSATION_ID_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Resolve the authoritative Assistant conversation identity for a stream
 * item, or `null` when the item is not Assistant-originated.
 *
 * Assistant-originated ⟺ canonical `originConversationId` present with NO
 * `originSurface` attestation. A present `originSurface` (Activity Room
 * mirror, Telegram, any future surface) means the owning surface is not
 * the Global Assistant → `null` (Reply stays local). Pure: no DOM, no
 * inference, no side effects.
 */
export function resolveAssistantConversationId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const carrier = item as AssistantProvenanceCarrier;
  const originConversationId = asProvenanceString(carrier.originConversationId);
  if (!originConversationId) return null;
  if (asProvenanceString(carrier.originSurface)) return null;
  return originConversationId;
}

export type ActivityReplyRoute =
  | { readonly kind: 'assistant'; readonly conversationId: string }
  | { readonly kind: 'activity-room' };

/**
 * Route an Activity Room Reply intent. `originSurface` + `originConversationId`
 * → owning conversational surface: Global Assistant provenance (conversation
 * id, no sending-surface attestation) opens the Assistant on the existing
 * conversation; Activity Room provenance (surface attested), missing, or
 * unknown provenance stays local.
 */
export function routeActivityReply(item: unknown): ActivityReplyRoute {
  const conversationId = resolveAssistantConversationId(item);
  if (conversationId) return { kind: 'assistant', conversationId };
  return { kind: 'activity-room' };
}

export interface OpenAssistantDetail {
  /** Existing conversation to select/restore. Never a creation request. */
  readonly conversationId?: string;
  /** Full-window geometry request (existing behavior). */
  readonly expanded?: boolean;
  /** Composer focus request (existing FloatingPanel focus contract). */
  readonly focusComposer?: boolean;
}

/**
 * Parse a conversation ID defensively from a potentially undefined value.
 * Returns the trimmed string if valid, otherwise `null`.
 */
function asConversationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > CONVERSATION_ID_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Parse an `open-assistant` event detail defensively. Non-string or blank
 * conversation ids are dropped (fail safe); `expanded` is true only when
 * explicitly `true`.
 */
export function parseOpenAssistantDetail(detail: unknown): {
  readonly conversationId?: string;
  readonly expanded: boolean;
  readonly focusComposer: boolean;
} {
  if (!detail || typeof detail !== 'object') return { expanded: false, focusComposer: false };
  const record = detail as Record<string, unknown>;
  const conversationId = asConversationId(record.conversationId) ?? undefined;
  return {
    ...(conversationId ? { conversationId } : {}),
    expanded: record.expanded === true,
    focusComposer: record.focusComposer !== false,
  };
}

/**
 * Request the owning surface open an EXISTING Assistant conversation and
 * focus its composer. Reuses the `open-assistant` event the Global Assistant
 * (sidebar entry, command palette, settings, agents page) already dispatches.
 * This function never creates a conversation — creation stays an explicit
 * user action inside the Assistant.
 */
export function requestOpenAssistantConversation(conversationId: string): void {
  const detail: OpenAssistantDetail = { conversationId, focusComposer: true };
  window.dispatchEvent(new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail }));
}

export interface ReplyItem {
  readonly id: string;
}

/**
 * Source-aware Reply entry point shared by click and keyboard activation
 * (the Reply control is a native `<button>`, so Enter/Space both arrive
 * here). Assistant-origin opens the Global Assistant on the existing
 * conversation; otherwise the local Activity Room reply path runs.
 * Returns the route taken for testability.
 */
export function handleActivityReply<T extends ReplyItem>(
  item: T,
  localReply: (item: T) => void,
): ActivityReplyRoute {
  const route = routeActivityReply(item);
  if (route.kind === 'assistant') {
    requestOpenAssistantConversation(route.conversationId);
    return route;
  }
  localReply(item);
  return route;
}
