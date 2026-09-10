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

export type {
  DEFAULT_OBSERVER_CONFIG,
  ObserverConfig,
  ObserverEventType,
  ObserverFinding,
  ObserverFindingStatus,
  ObserverFindingStore,
  ObserverSnapshotRef,
} from '@vestara/types';
export type { FindingTransitionResult } from './findings-lifecycle';
export {
  FindingLifecycleManager,
  getAllowedTransitions,
  isTransitionAllowed,
} from './findings-lifecycle';
export { Observer } from './observer';
export type {
  TemporalEvidenceQuery,
  TemporalEvidenceRecord,
  TemporalEvidenceResult,
  TemporalEvidenceStore,
} from './temporal-evidence';
export { InMemoryTemporalEvidenceStore } from './temporal-evidence';
