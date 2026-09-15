/**
 * CI-OBS-001B — CIClassification — category of a CI failure finding.
 *
 * Classification is a finding about what kind of failure occurred, not
 * a determination of root cause. Classification is a hypothesis that
 * can be rejected by new evidence.
 *
 * Invariants:
 *   - Classification is a finding, not authority
 *   - Failure ≠ Root Cause
 *   - Observation must not confer mutation authority
 */

/** Classification vocabulary for CI failure findings. */
export type CIClassification =
  | 'CODE'
  | 'TEST'
  | 'BUILD'
  | 'CONTRACT'
  | 'CONFIGURATION'
  | 'DEPENDENCY'
  | 'INFRASTRUCTURE'
  | 'RESOURCE'
  | 'FLAKE'
  | 'CANCELLED'
  | 'UNKNOWN';

/** Closed vocabulary — all valid classifications. */
export const CI_CLASSIFICATIONS: readonly CIClassification[] = [
  'CODE',
  'TEST',
  'BUILD',
  'CONTRACT',
  'CONFIGURATION',
  'DEPENDENCY',
  'INFRASTRUCTURE',
  'RESOURCE',
  'FLAKE',
  'CANCELLED',
  'UNKNOWN',
];

/** Classifications that indicate a transient/flaky failure. */
export const TRANSIENT_CLASSIFICATIONS: readonly CIClassification[] = ['FLAKE', 'RESOURCE', 'INFRASTRUCTURE'];

/** True when the classification suggests a transient failure. Pure. */
export function isTransientClassification(classification: CIClassification): boolean {
  return TRANSIENT_CLASSIFICATIONS.includes(classification);
}

/** True when the classification indicates the cause is unknown. Pure. */
export function isUnknownClassification(classification: CIClassification): boolean {
  return classification === 'UNKNOWN';
}
