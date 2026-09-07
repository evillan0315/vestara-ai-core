/**
 * @vestara/media-runtime — Media Connection
 *
 * A MediaConnection represents a participant's connection to a
 * MediaSession. It is the authority boundary for connection lifecycle.
 *
 * Ownership:
 *   - Created by: caller via MediaServer.createConnection()
 *   - Read by: Activity Room, diagnostics, UI projections
 *   - Closed by: caller via MediaServer.closeConnection() or provider expiry
 *
 * Lifecycle:
 *   pending → active → disconnected
 *                ↘ failed
 *
 * External IDs are optional before provider acceptance and immutable after.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts
 */

import type { MediaConnectionToken } from './media-connection-token';

export type MediaConnectionStatus = 'pending' | 'active' | 'disconnected' | 'failed';

/**
 * Provider-neutral participant capabilities.
 *
 * These are Vestara's conceptual capabilities, NOT OpenVidu role enums.
 * An adapter maps provider-specific roles to these capabilities.
 */
export interface MediaParticipantCapabilities {
  /** Can publish audio to the session. */
  readonly publishAudio: boolean;

  /** Can publish video to the session. */
  readonly publishVideo: boolean;

  /** Can subscribe to other participants' streams. */
  readonly subscribe: boolean;

  /** Can moderate (force-unpublish, disconnect) other participants. */
  readonly moderate: boolean;
}

/**
 * Well-known capability presets.
 */
export const MediaCapabilities = {
  /** Read-only subscriber. */
  SUBSCRIBER: Object.freeze({
    publishAudio: false,
    publishVideo: false,
    subscribe: true,
    moderate: false,
  }) as MediaParticipantCapabilities,

  /** Can publish and subscribe. */
  PUBLISHER: Object.freeze({
    publishAudio: true,
    publishVideo: true,
    subscribe: true,
    moderate: false,
  }) as MediaParticipantCapabilities,

  /** Full moderator. */
  MODERATOR: Object.freeze({
    publishAudio: true,
    publishVideo: true,
    subscribe: true,
    moderate: true,
  }) as MediaParticipantCapabilities,
} as const;

export interface MediaConnection {
  /** Vestara-internal connection identifier. Unique across all providers. */
  readonly id: string;

  /** The session this connection belongs to. */
  readonly sessionId: string;

  /** Provider-assigned external connection identifier.
   *  Optional before provider acceptance. Immutable after creation. */
  readonly externalConnectionId?: string;

  /** Current lifecycle status. */
  readonly status: MediaConnectionStatus;

  /** Participant capabilities (provider-neutral). */
  readonly capabilities: MediaParticipantCapabilities;

  /** Connection token. Opaque ephemeral credential — not in events/logs. */
  readonly token?: MediaConnectionToken;

  /** Whether the connection was created with a custom caller-supplied ID. */
  readonly customId: boolean;

  /** Unix timestamp (ms) when the connection was created. */
  readonly createdAt: number;

  /** Unix timestamp (ms) when the connection was last modified, or undefined. */
  readonly updatedAt?: number;

  /** Unix timestamp (ms) when the connection was disconnected, or undefined. */
  readonly disconnectedAt?: number;

  /** Reason for disconnection, or undefined. */
  readonly disconnectReason?: string;

  /** Provider-specific metadata. Opaque to Vestara — not in events/logs. */
  readonly providerMetadata?: Record<string, unknown>;
}

/** Events emitted by the MediaConnection lifecycle. */
export type MediaConnectionEvent =
  | { type: 'connection.pending'; connectionId: string; sessionId: string; timestamp: number }
  | { type: 'connection.active'; connectionId: string; externalConnectionId: string; timestamp: number }
  | { type: 'connection.disconnected'; connectionId: string; reason: string; timestamp: number }
  | { type: 'connection.failed'; connectionId: string; reason: string; timestamp: number };
