import { createHash } from 'node:crypto';
import type { MigrationStep, TableFingerprint } from './types';

/** Canonical, order-stable serialization of a step's declared postcondition. */
export function canonicalFingerprints(produces: readonly TableFingerprint[]): string {
  const tables = [...produces]
    .map((fingerprint) => ({ table: fingerprint.table, columns: [...fingerprint.columns].sort() }))
    .sort((left, right) => left.table.localeCompare(right.table));
  return JSON.stringify(tables);
}

/**
 * Checksum covering a step's identity and declared postcondition:
 * `sha256(name | canonical(produces))`. A mismatch after a step was applied
 * means the definition changed — fail closed, never trust it.
 */
export function stepChecksum(step: MigrationStep): string {
  return createHash('sha256')
    .update(`${step.name}|${canonicalFingerprints(step.produces)}`)
    .digest('hex');
}
