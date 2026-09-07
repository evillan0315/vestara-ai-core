/**
 * @vestara/activity-room — Activity Media Binding Service
 *
 * Manages the lifecycle of ActivityMediaBinding instances.
 * Enforces the one-active-binding-per-ActivityRoom invariant.
 * Provides idempotent media initialization.
 *
 * Lifecycle Semantics:
 *   requestMedia():
 *     1. Check for existing active binding → return if found (idempotent)
 *     2. Create MediaSession via MediaServer
 *     3. Create ActivityMediaBinding in "binding" status
 *     4. Transition binding to "active" status
 *     5. Return binding
 *
 *   closeMedia():
 *     1. Find active binding for ActivityRoom
 *     2. Transition binding to "closing" status
 *     3. Close MediaSession via MediaServer
 *     4. On success: transition to "closed"
 *     5. On failure: transition to "closure-failed"
 *
 *   replaceBinding():
 *     1. Check if latest binding is closure-failed → BLOCK (provider may be alive)
 *     2. Close existing active binding (if any)
 *     3. Create new binding via requestMedia()
 *
 * Credential Boundary:
 *   This service NEVER persists credentials, tokens, or MediaStream state.
 *   Credentials flow through MediaParticipantJoinResult and are discarded
 *   after delivery to the browser.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-005 Activity Media Binding → OVR-005 Authority Completion
 */

import type {
  CreateMediaConnectionOptions,
  CreateMediaConnectionResult,
  MediaParticipantCapabilities,
  MediaServer,
} from '@vestara/media-runtime';
import { consumeMediaConnectionCredential } from '@vestara/media-runtime';
import type { ActivityMediaBindingStore } from './media-binding-store';
import type {
  ActivityMediaBinding,
  ActivityMediaBindingId,
  CreateBindingOptions,
  MediaParticipantJoinResult,
  MediaParticipantType,
  ParticipantResolver,
  ResolvedParticipant,
} from './media-binding-types';
import { generateBindingId, PARTICIPANT_CAPABILITY_MAP } from './media-binding-types';

/**
 * Errors specific to Activity Media Binding operations.
 */
export class BindingError extends Error {
  constructor(
    message: string,
    public readonly bindingId?: ActivityMediaBindingId,
  ) {
    super(message);
    this.name = 'BindingError';
  }
}

export class BindingNotFoundError extends BindingError {
  constructor(activityRoomId: string) {
    super(`No active binding found for ActivityRoom: ${activityRoomId}`);
    this.name = 'BindingNotFoundError';
  }
}

export class BindingCreationFailedError extends BindingError {
  constructor(
    activityRoomId: string,
    public readonly cause: unknown,
  ) {
    super(`Failed to create binding for ActivityRoom: ${activityRoomId}`);
    this.name = 'BindingCreationFailedError';
  }
}

export class BindingClosureFailedError extends BindingError {
  constructor(
    bindingId: ActivityMediaBindingId,
    public readonly cause: unknown,
  ) {
    super(`Failed to close binding: ${bindingId}`);
    this.name = 'BindingClosureFailedError';
  }
}

/**
 * Thrown when a replacement is blocked because the latest binding
 * has a closure failure — the provider session may still be alive.
 */
export class ReplacementBlockedError extends BindingError {
  constructor(
    activityRoomId: string,
    public readonly latestBindingId: ActivityMediaBindingId,
  ) {
    super(
      `Replacement blocked for ActivityRoom ${activityRoomId}: ` +
        `latest binding ${latestBindingId} has closure-failed status. ` +
        `Provider session may still be alive. Confirm provider closure before replacing.`,
    );
    this.name = 'ReplacementBlockedError';
  }
}

/**
 * Thrown when participant resolution rejects the join request.
 */
export class ParticipantUnauthorizedError extends BindingError {
  constructor(activityRoomId: string, participantId: string, reason: string) {
    super(`Participant ${participantId} not authorized for ActivityRoom ${activityRoomId}: ${reason}`);
    this.name = 'ParticipantUnauthorizedError';
  }
}

/**
 * Options for the Activity Media Binding Service.
 */
export interface ActivityMediaBindingServiceOptions {
  /** The binding store for persistence. */
  readonly store: ActivityMediaBindingStore;

  /**
   * Default provider identifier.
   * Used when requestMedia() is called without specifying a provider.
   */
  readonly defaultProvider?: string;

  /**
   * Participant resolver for authorization.
   * Derives participant type and permissions from authoritative Vestara state.
   */
  readonly participantResolver: ParticipantResolver;
}

/**
 * Activity Media Binding Service.
 *
 * Coordinates ActivityRoom ↔ MediaSession correlation with:
 * - One-active-binding invariant per ActivityRoom
 * - Idempotent media initialization (with single-flight concurrency)
 * - Deterministic lifecycle transitions
 * - Credential boundary enforcement
 * - Authoritative participant authorization (never caller-supplied type)
 * - Closure-failure replacement blocking
 */
export class ActivityMediaBindingService {
  private readonly store: ActivityMediaBindingStore;
  private readonly defaultProvider: string;
  private readonly participantResolver: ParticipantResolver;

  /** Per-room single-flight locks for requestMedia(). */
  private readonly pendingCreations = new Map<string, Promise<ActivityMediaBinding>>();

  constructor(options: ActivityMediaBindingServiceOptions) {
    this.store = options.store;
    this.defaultProvider = options.defaultProvider ?? 'openvidu';
    this.participantResolver = options.participantResolver;
  }

  /**
   * Request media for an ActivityRoom.
   *
   * Idempotent: if an active binding already exists, returns it.
   * Concurrent-safe: multiple simultaneous calls for the same room
   * produce exactly one MediaServer.createSession() call.
   *
   * @param activityRoomId - The ActivityRoom to bind media to
   * @param mediaServer - The MediaServer to create the session with
   * @param provider - Optional provider override
   * @returns The active binding
   * @throws BindingCreationFailedError if MediaServer creation fails
   */
  async requestMedia(
    activityRoomId: string,
    mediaServer: MediaServer,
    provider?: string,
  ): Promise<ActivityMediaBinding> {
    // Idempotent: return existing active binding
    const existing = this.store.getActive(activityRoomId);
    if (existing) {
      return existing;
    }

    // Single-flight: if a creation is already in progress for this room,
    // wait for it instead of starting a parallel one.
    const pending = this.pendingCreations.get(activityRoomId);
    if (pending) {
      return pending;
    }

    // Start creation and register the pending promise
    const creation = this.doCreateBinding(activityRoomId, mediaServer, provider);
    this.pendingCreations.set(activityRoomId, creation);

    try {
      return await creation;
    } finally {
      this.pendingCreations.delete(activityRoomId);
    }
  }

  /**
   * Internal: actually create the binding (called once per room due to single-flight).
   */
  private async doCreateBinding(
    activityRoomId: string,
    mediaServer: MediaServer,
    provider?: string,
  ): Promise<ActivityMediaBinding> {
    const providerId = provider ?? this.defaultProvider;
    const now = Date.now();

    // Create MediaSession via provider
    let mediaSession;
    try {
      mediaSession = await mediaServer.createSession({
        metadata: { activityRoomId },
      });
    } catch (err) {
      throw new BindingCreationFailedError(activityRoomId, err);
    }

    // Create binding in "binding" status
    const bindingId = generateBindingId();
    const binding: ActivityMediaBinding = {
      id: bindingId,
      activityRoomId,
      mediaSessionId: mediaSession.id,
      provider: providerId,
      status: 'binding',
      createdAt: now,
      updatedAt: now,
    };

    this.store.create(binding);

    // Transition to "active" — the session is created and ready
    this.store.updateStatus(bindingId, 'active');

    // Return the active binding
    return this.store.get(bindingId)!;
  }

  /**
   * Close media for an ActivityRoom.
   *
   * Finds the active binding, closes the MediaSession, and transitions
   * the binding to "closed" (or "closure-failed" on error).
   *
   * @param activityRoomId - The ActivityRoom to close media for
   * @param mediaServer - The MediaServer to close the session with
   * @throws BindingNotFoundError if no active binding exists
   * @throws BindingClosureFailedError if MediaServer closure fails
   */
  async closeMedia(activityRoomId: string, mediaServer: MediaServer): Promise<void> {
    const binding = this.store.getActive(activityRoomId);
    if (!binding) {
      throw new BindingNotFoundError(activityRoomId);
    }

    // Transition to "closing"
    this.store.updateStatus(binding.id, 'closing');

    try {
      await mediaServer.closeSession(binding.mediaSessionId);
      this.store.updateStatus(binding.id, 'closed');
    } catch (err) {
      // Closure failed — provider session may still be alive
      this.store.updateStatus(binding.id, 'closure-failed', String(err));
      throw new BindingClosureFailedError(binding.id, err);
    }
  }

  /**
   * Replace an existing binding with a new one.
   *
   * BLOCKED if the latest binding has "closure-failed" status —
   * the provider session may still be alive and creating a new
   * session could produce duplicate provider sessions.
   *
   * @param activityRoomId - The ActivityRoom to replace binding for
   * @param mediaServer - The MediaServer for both close and create
   * @param provider - Optional provider override
   * @returns The new active binding
   * @throws ReplacementBlockedError if latest binding has closure-failed status
   */
  async replaceBinding(
    activityRoomId: string,
    mediaServer: MediaServer,
    provider?: string,
  ): Promise<ActivityMediaBinding> {
    const latest = this.store.getLatest(activityRoomId);

    // BLOCK replacement if latest binding has closure-failed status
    if (latest && latest.status === 'closure-failed') {
      throw new ReplacementBlockedError(activityRoomId, latest.id);
    }

    // Best-effort close of existing binding
    const existing = this.store.getActive(activityRoomId);
    if (existing) {
      this.store.updateStatus(existing.id, 'closing');
      try {
        await mediaServer.closeSession(existing.mediaSessionId);
        this.store.updateStatus(existing.id, 'closed');
      } catch {
        // Best-effort: mark as closure-failed but continue
        this.store.updateStatus(existing.id, 'closure-failed', 'replaced');
      }
    }

    // Create new binding
    return this.requestMedia(activityRoomId, mediaServer, provider);
  }

  /**
   * Get the active binding for an ActivityRoom.
   *
   * @param activityRoomId - The ActivityRoom to query
   * @returns The active binding, or undefined if none exists
   */
  getActiveBinding(activityRoomId: string): ActivityMediaBinding | undefined {
    return this.store.getActive(activityRoomId);
  }

  /**
   * Get a binding by ID.
   *
   * @param bindingId - The binding ID to retrieve
   * @returns The binding, or undefined if not found
   */
  getBinding(bindingId: ActivityMediaBindingId): ActivityMediaBinding | undefined {
    return this.store.get(bindingId);
  }

  /**
   * Get the binding for a specific MediaSession.
   *
   * @param mediaSessionId - The MediaSession ID to look up
   * @returns The binding, or undefined if not found
   */
  getBindingByMediaSession(mediaSessionId: string): ActivityMediaBinding | undefined {
    return this.store.getByMediaSession(mediaSessionId);
  }

  /**
   * List all bindings for an ActivityRoom.
   *
   * @param activityRoomId - The ActivityRoom to list bindings for
   * @returns Bindings ordered by creation time (newest first)
   */
  listBindings(activityRoomId: string): readonly ActivityMediaBinding[] {
    return this.store.listByActivityRoom(activityRoomId);
  }

  /**
   * Join a participant to an ActivityRoom's media session.
   *
   * Authorization flow:
   *   1. Resolve active binding for ActivityRoom
   *   2. Resolve participant from authoritative Vestara state (NOT caller-supplied)
   *   3. Check authorization — reject if not authorized
   *   4. Derive capabilities from authoritative participant type + permissions
   *   5. Create connection via MediaServer
   *   6. Return credential for browser delivery
   *
   * The credential is ephemeral — caller must deliver to browser and discard.
   *
   * CRITICAL: participantType is NEVER supplied by the caller.
   * It is derived from authoritative Vestara state via the ParticipantResolver.
   *
   * @param activityRoomId - The ActivityRoom to join
   * @param participantId - The participant identifier (claimed identity)
   * @param mediaServer - The MediaServer to create the connection with
   * @returns Join result with credential for browser delivery
   * @throws BindingNotFoundError if no active binding exists
   * @throws ParticipantUnauthorizedError if participant is not authorized
   */
  async joinParticipant(
    activityRoomId: string,
    participantId: string,
    mediaServer: MediaServer,
  ): Promise<MediaParticipantJoinResult> {
    // Resolve active binding
    const binding = this.store.getActive(activityRoomId);
    if (!binding) {
      throw new BindingNotFoundError(activityRoomId);
    }

    // Resolve participant from authoritative Vestara state
    // participantType is NEVER caller-supplied
    const resolved = await this.participantResolver.resolve(activityRoomId, participantId);

    // Check authorization
    if (!resolved.authorized) {
      throw new ParticipantUnauthorizedError(
        activityRoomId,
        participantId,
        resolved.rejectionReason ?? 'not authorized',
      );
    }

    // Derive capabilities from authoritative participant type + permissions
    const baseCapabilities = PARTICIPANT_CAPABILITY_MAP[resolved.participantType];
    const capabilities: MediaParticipantCapabilities = {
      ...baseCapabilities,
      moderate: resolved.canModerate,
    };

    // Create connection via MediaServer
    let result: CreateMediaConnectionResult;
    try {
      result = await mediaServer.createConnection(binding.mediaSessionId, {
        id: `conn-${participantId}-${Date.now()}`,
        capabilities,
        metadata: { participantId, participantType: resolved.participantType },
      });
    } catch (err) {
      throw new BindingCreationFailedError(activityRoomId, err);
    }

    // Extract credential for delivery — NEVER persist
    const credential = consumeMediaConnectionCredential(result.credential);

    return {
      binding,
      connectionId: result.connection.id,
      credential,
      capabilities,
    };
  }

  /**
   * Map a participant type to baseline media capabilities.
   * This is the baseline mapping — the ParticipantResolver may
   * further restrict or expand based on authoritative permissions.
   *
   * @param participantType - The participant type
   * @returns The baseline media capabilities for this participant type
   */
  mapCapabilities(participantType: MediaParticipantType): MediaParticipantCapabilities {
    return PARTICIPANT_CAPABILITY_MAP[participantType];
  }
}
