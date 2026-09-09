/**
 * @vestara/observer — Observer Authority
 *
 * Subscribes to diagnostic output via EventBus, produces ObserverFinding records,
 * and stores them in the ObserverFindingStore. Read-only to all authority stores.
 *
 * Architecture Traceability:
 *   OBS-1: Observer Foundation
 *   OBS-4: Health/Degradation Model
 *
 * Invariants:
 *   INV-OBS-1: Observer cannot write to authority stores
 *   INV-OBS-2: Findings reference facts, never duplicate them
 *   INV-OBS-3: Observer does not trigger execution
 */

export { Observer } from './observer';
export type {
  ObserverConfig,
  ObserverEventType,
  ObserverFinding,
  ObserverFindingStatus,
  ObserverFindingStore,
  ObserverSnapshotRef,
  DEFAULT_OBSERVER_CONFIG,
} from '@vestara/types';
