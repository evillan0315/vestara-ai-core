// OpenCodeEventBridge types and pure normalization.
//
// The bridge normalizes raw upstream SSE events (id/type/properties) into
// Vestara-domain OpenCodeBridgeEvent values, then publishes them onto the
// EventBus as `opencode.*` envelopes. Normalization is renderer-free and
// unit-testable without an upstream server.

import type { OpenCodeEvent } from '../client/opencode-types';

export type OpenCodeBridgeEventCategory = 'server' | 'session' | 'message' | 'permission' | 'unknown';

export interface OpenCodeBridgeEvent {
  readonly upstreamId: string;
  readonly type: string;
  readonly category: OpenCodeBridgeEventCategory;
  readonly sessionId?: string;
  readonly messageId?: string;
  readonly partId?: string;
  readonly delta?: string;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

export type OpenCodeBridgeConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

const PERMISSION_TYPES = new Set([
  'permission.request',
  'permission.update',
  'permission.response',
  'permission.resolved',
]);

function categoryForType(type: string): OpenCodeBridgeEventCategory {
  if (PERMISSION_TYPES.has(type) || type.startsWith('permission.')) return 'permission';
  if (type.startsWith('session.') || type === 'session.idle') return 'session';
  if (type.startsWith('message.') || type.startsWith('step-')) return 'message';
  if (type.startsWith('server.')) return 'server';
  return 'unknown';
}

/**
 * Normalize a single raw upstream event. Drops frames that carry no usable
 * type. Extracts session/message/part ids and text deltas from the properties.
 */
export function normalizeOpenCodeEvent(raw: OpenCodeEvent | undefined): OpenCodeBridgeEvent | undefined {
  if (!raw || typeof raw.type !== 'string' || !raw.type) return undefined;
  const properties = raw.payload ?? {};
  const sessionId = asString(properties.sessionID);
  const messageId =
    asString(properties.messageID) ??
    (properties.part && typeof properties.part === 'object'
      ? asString((properties.part as Record<string, unknown>).messageID)
      : undefined) ??
    (properties.info && typeof properties.info === 'object'
      ? asString((properties.info as Record<string, unknown>).id)
      : undefined);
  const partId =
    asString(properties.partID) ??
    (properties.part && typeof properties.part === 'object'
      ? asString((properties.part as Record<string, unknown>).id)
      : undefined);
  const delta = asString(properties.delta);
  return {
    upstreamId: raw.id,
    type: raw.type,
    category: categoryForType(raw.type),
    sessionId,
    messageId,
    partId,
    delta,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    payload: properties,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
