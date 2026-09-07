/**
 * @vestara/activity-room — Activity Media Binding Store
 *
 * In-memory store for ActivityMediaBinding instances.
 * Provides CRUD operations and lifecycle-aware queries.
 *
 * Design:
 *   - One active binding per ActivityRoom (invariant enforced by service)
 *   - Bindings are append-only; status transitions are updates
 *   - Clone-on-read to prevent mutation of stored bindings
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-005 Activity Media Binding
 */

import type { ActivityMediaBinding, ActivityMediaBindingId, ActivityMediaBindingStatus } from './media-binding-types';

/**
 * Store interface for ActivityMediaBinding persistence.
 * Decoupled from the service for testability.
 */
export interface ActivityMediaBindingStore {
  /** Insert a new binding. Rejects if ID already exists. */
  create(binding: ActivityMediaBinding): void;

  /** Retrieve a binding by ID. Returns undefined if not found. */
  get(id: ActivityMediaBindingId): ActivityMediaBinding | undefined;

  /**
   * Retrieve the active binding for an ActivityRoom.
   * Returns the binding in "binding" or "active" status, or undefined.
   */
  getActive(activityRoomId: string): ActivityMediaBinding | undefined;

  /**
   * Retrieve the most recent binding for an ActivityRoom regardless of status.
   * Returns undefined if no bindings exist.
   */
  getLatest(activityRoomId: string): ActivityMediaBinding | undefined;

  /**
   * Retrieve a binding by its associated MediaSession ID.
   * Returns undefined if not found.
   */
  getByMediaSession(mediaSessionId: string): ActivityMediaBinding | undefined;

  /**
   * Update the status of a binding.
   * Sets updatedAt to current timestamp. Sets closedAt for closed/failed.
   */
  updateStatus(id: ActivityMediaBindingId, status: ActivityMediaBindingStatus, failureReason?: string): void;

  /**
   * List all bindings for an ActivityRoom, ordered by creation time (newest first).
   */
  listByActivityRoom(activityRoomId: string): readonly ActivityMediaBinding[];
}

/**
 * In-memory implementation of ActivityMediaBindingStore.
 */
export class InMemoryActivityMediaBindingStore implements ActivityMediaBindingStore {
  private readonly bindings = new Map<ActivityMediaBindingId, ActivityMediaBinding>();
  private readonly byActivityRoom = new Map<string, Set<ActivityMediaBindingId>>();
  private readonly byMediaSession = new Map<string, ActivityMediaBindingId>();

  create(binding: ActivityMediaBinding): void {
    if (this.bindings.has(binding.id)) {
      throw new Error(`Binding already exists: ${binding.id}`);
    }

    // Store the binding (clone for immutability)
    this.bindings.set(binding.id, structuredClone(binding));

    // Index by activityRoomId
    let roomSet = this.byActivityRoom.get(binding.activityRoomId);
    if (!roomSet) {
      roomSet = new Set();
      this.byActivityRoom.set(binding.activityRoomId, roomSet);
    }
    roomSet.add(binding.id);

    // Index by mediaSessionId
    this.byMediaSession.set(binding.mediaSessionId, binding.id);
  }

  get(id: ActivityMediaBindingId): ActivityMediaBinding | undefined {
    const binding = this.bindings.get(id);
    return binding ? structuredClone(binding) : undefined;
  }

  getActive(activityRoomId: string): ActivityMediaBinding | undefined {
    const roomSet = this.byActivityRoom.get(activityRoomId);
    if (!roomSet) return undefined;

    for (const id of roomSet) {
      const binding = this.bindings.get(id);
      if (binding && (binding.status === 'binding' || binding.status === 'active')) {
        return structuredClone(binding);
      }
    }
    return undefined;
  }

  getLatest(activityRoomId: string): ActivityMediaBinding | undefined {
    const roomSet = this.byActivityRoom.get(activityRoomId);
    if (!roomSet) return undefined;

    let latest: ActivityMediaBinding | undefined;
    for (const id of roomSet) {
      const binding = this.bindings.get(id);
      if (binding && (!latest || binding.createdAt > latest.createdAt)) {
        latest = binding;
      }
    }
    return latest ? structuredClone(latest) : undefined;
  }

  getByMediaSession(mediaSessionId: string): ActivityMediaBinding | undefined {
    const id = this.byMediaSession.get(mediaSessionId);
    if (!id) return undefined;
    const binding = this.bindings.get(id);
    return binding ? structuredClone(binding) : undefined;
  }

  updateStatus(id: ActivityMediaBindingId, status: ActivityMediaBindingStatus, failureReason?: string): void {
    const existing = this.bindings.get(id);
    if (!existing) {
      throw new Error(`Binding not found: ${id}`);
    }

    const now = Date.now();
    const updated: ActivityMediaBinding = {
      ...existing,
      status,
      updatedAt: now,
      ...(status === 'closed' || status === 'creation-failed' || status === 'closure-failed' ? { closedAt: now } : {}),
      ...(failureReason !== undefined ? { failureReason } : {}),
    };

    this.bindings.set(id, structuredClone(updated));
  }

  listByActivityRoom(activityRoomId: string): readonly ActivityMediaBinding[] {
    const roomSet = this.byActivityRoom.get(activityRoomId);
    if (!roomSet) return [];

    const result: ActivityMediaBinding[] = [];
    for (const id of roomSet) {
      const binding = this.bindings.get(id);
      if (binding) result.push(structuredClone(binding));
    }

    // Sort by createdAt descending (newest first)
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }
}
