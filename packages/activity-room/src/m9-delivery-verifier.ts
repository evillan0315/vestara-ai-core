/**
 * AR-REC-C2 CORRECTION: M9 Delivery Verification Adapter
 *
 * Implements PublicationDeliveryVerifier using the M9 ActivityStore.
 * Checks whether a semantic event exists in the M9 projection via getByEventId.
 *
 * Ownership boundary:
 *   - This adapter lives in activity-room (M9 side)
 *   - It implements the port defined in interaction-persistence (consumer side)
 *   - No reverse dependency: M9 does NOT know about interaction publication
 *   - The adapter is a thin query wrapper, not a coordination mechanism
 */

import type { PublicationDeliveryVerifier } from '@vestara/interaction-persistence';
import type { M9ActivityStore } from './m9-types';

/**
 * M9-backed delivery verification. Checks the durable activity store
 * for the existence of a semantic event by its deterministic eventId.
 */
export class M9DeliveryVerifier implements PublicationDeliveryVerifier {
  constructor(private readonly store: M9ActivityStore) {}

  async wasDelivered(eventId: string): Promise<boolean> {
    const record = await this.store.getByEventId(eventId);
    return record !== undefined;
  }
}
