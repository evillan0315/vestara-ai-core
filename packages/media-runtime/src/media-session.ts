/**
 * @vestara/media-runtime — Media Session
 *
 * A MediaSession is Vestara's representation of a conferencing/media
 * session. It is the authority boundary for session lifecycle.
 *
 * Ownership:
 *   - Created by: caller via MediaServer.createSession()
 *   - Read by: Activity Room, diagnostics, UI projections
 *   - Closed by: caller via MediaServer.closeSession() or provider expiry
 *
 * Lifecycle:
 *   creating → active → closing → closed
 *                   ↘ failed
 *
 * External IDs are optional before provider acceptance and immutable after.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts
 */

export type MediaSessionStatus = 'creating' | 'active' | 'closing' | 'closed' | 'failed';

export interface MediaSession {
  /** Vestara-internal session identifier. Unique across all providers. */
  readonly id: string;

  /** Provider identifier (e.g. "openvidu"). Provider-neutral. */
  readonly provider: string;

  /**
   * Provider-assigned external session identifier.
   * Optional before provider acceptance. Immutable after creation.
   * This is an opaque string — Vestara does not parse or interpret it.
   */
  readonly externalSessionId?: string;

  /** Current lifecycle status. */
  readonly status: MediaSessionStatus;

  /** Whether the session was created with a custom caller-supplied ID. */
  readonly customId: boolean;

  /** Unix timestamp (ms) when the session was created. */
  readonly createdAt: number;

  /** Unix timestamp (ms) when the session was last modified, or undefined. */
  readonly updatedAt?: number;

  /** Unix timestamp (ms) when the session was closed, or undefined. */
  readonly closedAt?: number;

  /** Provider-specific metadata. Opaque to Vestara — not in events/logs. */
  readonly providerMetadata?: Record<string, unknown>;
}

/** Events emitted by the MediaSession lifecycle. */
export type MediaSessionEvent =
  | { type: 'session.creating'; sessionId: string; provider: string; timestamp: number }
  | { type: 'session.active'; sessionId: string; externalSessionId: string; timestamp: number }
  | { type: 'session.closing'; sessionId: string; timestamp: number }
  | { type: 'session.closed'; sessionId: string; timestamp: number }
  | { type: 'session.failed'; sessionId: string; reason: string; timestamp: number };
