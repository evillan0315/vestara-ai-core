/**
 * @vestara/observer — Observer Authority
 *
 * Subscribes to diagnostic output via EventBus, produces ObserverFinding records,
 * and stores them in the ObserverFindingStore. Read-only to all authority stores.
 *
 * Architecture Traceability:
 *   OBS-1: Observer Foundation
 *   OBS-2: Temporal Evidence Retrieval
 *   OBS-3: Findings Lifecycle
 *   OBS-4: Health/Degradation Model
 *
 * Invariants:
 *   INV-OBS-1: Observer cannot write to authority stores
 *   INV-OBS-2: Findings reference facts, never duplicate them
 *   INV-OBS-3: Observer does not trigger execution
 */

export { Observer } from './observer';
export { InMemoryTemporalEvidenceStore } from './temporal-evidence';
export type {
  TemporalEvidenceQuery,
  TemporalEvidenceRecord,
  TemporalEvidenceResult,
  TemporalEvidenceStore,
} from './temporal-evidence';
export {
  FindingLifecycleManager,
  isTransitionAllowed,
  getAllowedTransitions,
} from './findings-lifecycle';
export type {
  FindingTransitionResult,
} from './findings-lifecycle';
export type {
  ObserverConfig,
  ObserverEventType,
  ObserverFinding,
  ObserverFindingStatus,
  ObserverFindingStore,
  ObserverSnapshotRef,
  DEFAULT_OBSERVER_CONFIG,
} from '@vestara/types';
