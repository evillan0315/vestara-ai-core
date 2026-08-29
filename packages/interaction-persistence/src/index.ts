/**
 * AR-REC-C2: Interaction Persistence Package
 *
 * Exports the port interfaces, publication port, delivery verification port,
 * EventBus adapter, and SQLite adapter.
 * The interaction-persistence package is consumed by interaction-app.
 */

export { InteractionEventBusAdapter } from './interaction-event-bus-adapter';
export type {
  InteractionPersistencePort,
  PendingPublication,
  PersistedInteraction,
  PersistedResponse,
} from './interaction-persistence-port';
export type {
  InteractionPresentedPayload,
  InteractionPublicationPort,
  InteractionRespondedPayload,
} from './interaction-publication-port';
export { INTERACTION_MANIFEST, INTERACTION_MIGRATIONS } from './migrations';
export type { PublicationDeliveryVerifier } from './publication-delivery-verifier';
export { SqliteInteractionStore } from './sqlite-store';
