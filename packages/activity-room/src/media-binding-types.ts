/**
 * @vestara/activity-room — Activity Media Binding Types
 *
 * Provider-neutral correlation between an Activity Room and its media
 * conference/session. This is the binding authority — it knows which
 * MediaSession is associated with which ActivityRoom, and in what state.
 *
 * Ownership:
 *   - Created by: ActivityMediaBindingService.requestMedia()
 *   - Read by: participant join resolution, diagnostics, UI projections
 *   - Closed by: ActivityMediaBindingService.closeMedia()
 *
 * Lifecycle:
 *   binding → active → closing → closed
 *            ↘ failed
 *
 * Authority Separation:
 *   - ActivityRoom: collaboration/activity identity
 *   - ActivityMediaBinding: ActivityRoom ↔ MediaSession correlation
 *   - MediaServer: provider control operations
 *   - OpenVidu: provider media lifecycle
 *   - Browser: local MediaStream/device state
 *
 * Credential Boundary:
 *   This module NEVER persists, emits, or logs connection credentials,
 *   tokens, secrets, or MediaStream state.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-005 Activity Media Binding
 */

import type { MediaParticipantCapabilities } from '@vestara/media-runtime';

/**
 * Branded ID type for ActivityMediaBinding instances.
 * Format: `amb-{timestamp}-{random}`
 */
export type ActivityMediaBindingId = string & {
  readonly __brand: 'ActivityMediaBindingId';
};

/**
 * Lifecycle status of an ActivityMediaBinding.
 *
 * Mirrors MediaSession lifecycle but at the binding level.
 * A binding in "binding" or "active" state is the one-active-binding
 * for its ActivityRoom.
 *
 * Failed states distinguish between:
 *   - "creation-failed": provider session creation failed (safe to retry)
 *   - "closure-failed": provider session closure failed (provider may still be alive)
 */
export type ActivityMediaBindingStatus =
  | 'binding'
  | 'active'
  | 'closing'
  | 'closed'
  | 'creation-failed'
  | 'closure-failed';

/**
 * ActivityMediaBinding — correlation state between an ActivityRoom
 * and a MediaSession.
 *
 * Contains ONLY correlation data. No credentials, no MediaStream,
 * no OpenVidu types, no transport state.
 */
export interface ActivityMediaBinding {
  /** Unique binding identifier. Format: `amb-{timestamp}-{random}` */
  readonly id: ActivityMediaBindingId;

  /** The ActivityRoom this binding is associated with. */
  readonly activityRoomId: string;

  /** The MediaSession ID (provider-neutral Vestara ID). */
  readonly mediaSessionId: string;

  /** Provider identifier (e.g. "openvidu"). */
  readonly provider: string;

  /** Current lifecycle status. */
  readonly status: ActivityMediaBindingStatus;

  /** Unix timestamp (ms) when the binding was created. */
  readonly createdAt: number;

  /** Unix timestamp (ms) when the binding was last modified. */
  readonly updatedAt: number;

  /** Unix timestamp (ms) when the binding was closed, or undefined. */
  readonly closedAt?: number;

  /** Reason for failure, if status is "failed". */
  readonly failureReason?: string;
}

/**
 * Options for creating a new ActivityMediaBinding.
 */
export interface CreateBindingOptions {
  /** The ActivityRoom to bind. */
  readonly activityRoomId: string;

  /** The MediaSession ID to correlate. */
  readonly mediaSessionId: string;

  /** Provider identifier. */
  readonly provider: string;
}

/**
 * Result of a participant join operation.
 *
 * Contains the credential for secure delivery to the browser.
 * The credential MUST NOT be persisted or emitted.
 */
export interface MediaParticipantJoinResult {
  /** The active binding for this ActivityRoom. */
  readonly binding: ActivityMediaBinding;

  /** The connection ID (provider-neutral Vestara ID). */
  readonly connectionId: string;

  /** The ephemeral credential. Deliver to browser, then discard. */
  readonly credential: unknown;

  /** The participant's media capabilities. */
  readonly capabilities: MediaParticipantCapabilities;
}

/**
 * Participant type — derived from authoritative Vestara state.
 * Used for capability mapping. NEVER supplied by untrusted caller.
 */
export type MediaParticipantType = 'human' | 'agent' | 'system';

/**
 * Resolved participant information from authoritative Vestara state.
 * This is what the ParticipantResolver returns — the source of truth
 * for who this participant is and what they are allowed to do.
 */
export interface ResolvedParticipant {
  /** The participant identifier (same as the join request participantId). */
  readonly participantId: string;

  /** The participant type, derived from authoritative state (not caller-supplied). */
  readonly participantType: MediaParticipantType;

  /** Whether this participant is authorized to access this ActivityRoom. */
  readonly authorized: boolean;

  /** Whether this participant has moderation authority. Derived from authority, not defaulted. */
  readonly canModerate: boolean;

  /** Optional reason for rejection (when authorized=false). */
  readonly rejectionReason?: string;
}

/**
 * Authoritative participant resolution interface.
 *
 * Implementations consult Vestara's agent/team/permission authority
 * to determine participant identity, type, and permissions.
 *
 * This is the boundary between untrusted join requests and
 * authoritative capability derivation.
 */
export interface ParticipantResolver {
  /**
   * Resolve a participant from authoritative Vestara state.
   *
   * @param activityRoomId - The ActivityRoom being joined
   * @param participantId - The claimed participant identifier
   * @returns Resolved participant with authoritative type and permissions
   */
  resolve(activityRoomId: string, participantId: string): Promise<ResolvedParticipant>;
}

/**
 * Maps participant type to default media capabilities.
 *
 * These are BASELINE capabilities — the ParticipantResolver may
 * further restrict or expand based on authoritative permissions.
 *
 * Important: moderate is false by default for ALL types.
 * Only explicit authorization grants moderation.
 */
export const PARTICIPANT_CAPABILITY_MAP: Record<MediaParticipantType, MediaParticipantCapabilities> = {
  human: {
    publishAudio: true,
    publishVideo: true,
    subscribe: true,
    moderate: false, // NOT automatic — must be authorized
  },
  agent: {
    publishAudio: false,
    publishVideo: false,
    subscribe: true,
    moderate: false,
  },
  system: {
    publishAudio: false,
    publishVideo: false,
    subscribe: true,
    moderate: false,
  },
};

/**
 * Generate a binding ID following Vestara conventions.
 * Format: `amb-{timestamp}-{random8}`
 */
export function generateBindingId(): ActivityMediaBindingId {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `amb-${timestamp}-${random}` as ActivityMediaBindingId;
}
