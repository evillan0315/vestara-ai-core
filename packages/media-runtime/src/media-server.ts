/**
 * @vestara/media-runtime — MediaServer Port
 *
 * Provider-neutral control-plane port for media session/connection management.
 * Implementations are provider-specific adapters (e.g. OpenVidu).
 *
 * Lifecycle semantics:
 *   - Caller creates sessions and connections.
 *   - MediaServer returns Vestara domain objects with status transitions.
 *   - External IDs are optional on input, populated after provider acceptance.
 *   - Tokens are ephemeral credentials — caller is responsible for secure delivery.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-001 Media Runtime Contracts
 */

import type { MediaConnection, MediaParticipantCapabilities } from './media-connection';
import type { MediaConnectionCredential } from './media-connection-token';
import type { MediaProviderCapabilities } from './media-provider-capabilities';
import type { MediaSession } from './media-session';

/** Options for creating a MediaSession. */
export interface CreateMediaSessionOptions {
  /** Custom session ID. If omitted, the provider generates one. */
  readonly id?: string;

  /** Provider-specific metadata. Opaque to Vestara. */
  readonly metadata?: Record<string, unknown>;
}

/** Options for creating a MediaConnection. */
export interface CreateMediaConnectionOptions {
  /** Custom connection ID. If omitted, the provider generates one. */
  readonly id?: string;

  /** Participant capabilities. Provider maps these to its role system. */
  readonly capabilities: MediaParticipantCapabilities;

  /** Provider-specific metadata. Opaque to Vestara. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of creating a connection — includes the credential.
 *
 * The credential is ephemeral. It MUST NOT be persisted
 * into Activity events, logs, evidence, diagnostics, or telemetry.
 * Use consumeMediaConnectionCredential() to extract the secret
 * at the one required trust-boundary operation.
 */
export interface CreateMediaConnectionResult {
  /** The connection domain object. */
  readonly connection: MediaConnection;

  /** The ephemeral credential. Deliver secret to browser client, then discard. */
  readonly credential: MediaConnectionCredential;
}

/**
 * Provider-neutral control-plane port.
 *
 * This is the boundary between Vestara domain logic and provider
 * implementation. Each provider (OpenVidu, Twilio, etc.) implements
 * this interface with its native REST/control API.
 *
 * The implementation handles:
 *   - Basic Auth / credentials (server-side only)
 *   - Provider-specific REST API calls
 *   - Role/capability mapping
 *   - External ID management
 *   - Token generation
 *
 * The implementation does NOT handle:
 *   - WebRTC signaling (handled by browser client with token)
 *   - MediaStream/MediaStreamTrack (browser domain)
 *   - Activity Room integration (handled by higher layers)
 *   - Audio/STT/VAD (handled by voice pipeline)
 */
export interface MediaServer {
  /** Provider identifier (e.g. "openvidu"). */
  readonly provider: string;

  /** Provider version string. */
  readonly version: string;

  /**
   * Returns the provider's declared capabilities.
   * Callers check capabilities instead of probing the provider.
   */
  getCapabilities(): MediaProviderCapabilities;

  /**
   * Health check — verifies the provider is reachable and authenticated.
   * Returns true if healthy, throws MediaError if not.
   */
  healthCheck(): Promise<boolean>;

  /**
   * Creates a new media session.
   *
   * Lifecycle: creates → active (on provider acceptance)
   *
   * @param options - Session creation options
   * @returns The created session domain object
   * @throws MediaError if creation fails
   */
  createSession(options?: CreateMediaSessionOptions): Promise<MediaSession>;

  /**
   * Closes an active session and disconnects all participants.
   *
   * Lifecycle: active → closing → closed
   *
   * @param sessionId - Vestara session ID
   * @throws MediaSessionNotFoundError if session not found
   * @throws MediaSessionAlreadyClosedError if already closed
   */
  closeSession(sessionId: string): Promise<void>;

  /**
   * Retrieves a session by ID.
   *
   * @param sessionId - Vestara session ID
   * @returns The session, or undefined if not found
   */
  getSession(sessionId: string): Promise<MediaSession | undefined>;

  /**
   * Lists all active sessions.
   *
   * @returns Array of active sessions
   */
  listSessions(): Promise<ReadonlyArray<MediaSession>>;

  /**
   * Creates a new connection to a session.
   *
   * Lifecycle: creates → active (on provider acceptance)
   *
   * @param sessionId - Vestara session ID
   * @param options - Connection creation options
   * @returns Connection + ephemeral token
   * @throws MediaSessionNotFoundError if session not found
   * @throws MediaSessionAlreadyClosedError if session is closed
   * @throws MediaConnectionCreationFailedError if creation fails
   */
  createConnection(sessionId: string, options: CreateMediaConnectionOptions): Promise<CreateMediaConnectionResult>;

  /**
   * Closes a connection (participant leaves).
   *
   * Lifecycle: active → disconnected
   *
   * @param connectionId - Vestara connection ID
   * @param reason - Optional reason for disconnection
   * @throws MediaConnectionNotFoundError if connection not found
   */
  closeConnection(connectionId: string, reason?: string): Promise<void>;

  /**
   * Retrieves a connection by ID.
   *
   * @param connectionId - Vestara connection ID
   * @returns The connection, or undefined if not found
   */
  getConnection(connectionId: string): Promise<MediaConnection | undefined>;

  /**
   * Lists all connections for a session.
   *
   * @param sessionId - Vestara session ID
   * @returns Array of connections in the session
   */
  listConnections(sessionId: string): Promise<ReadonlyArray<MediaConnection>>;
}
