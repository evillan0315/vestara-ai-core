/**
 * AR-REC-C2 CORRECTION: Publication Delivery Verification Port
 *
 * Generic port for verifying that a semantic event was delivered to a projection.
 * Used by InteractionService to verify M9 received the event before marking published.
 *
 * Ownership boundary:
 *   - This port is defined in interaction-persistence (consumer side)
 *   - The adapter implementation lives in activity-projection (provider side)
 *   - M9IngestionBridge does NOT know about this port
 *   - InteractionEventBusAdapter does NOT know about this port
 *   - InteractionService coordinates: emit → verify → acknowledge
 *
 * Invariants:
 *   - M9 remains a replaceable projection implementation
 *   - The port expresses generic delivery verification, not M9 internals
 *   - The port is acyclic: no callback from projection to application
 */

/**
 * Verifies that a semantic event was delivered to the projection store.
 * Implemented by the composition root using the activity store's getByEventId.
 */
export interface PublicationDeliveryVerifier {
  /**
   * Check whether a semantic eventId exists in the projection store.
   * Returns true if the event was successfully ingested.
   *
   * @param eventId The deterministic semantic event identity
   *   (e.g. "interaction:presented:${interactionId}")
   */
  wasDelivered(eventId: string): Promise<boolean>;
}
