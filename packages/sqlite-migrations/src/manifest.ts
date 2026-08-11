import type { Database } from 'sql.js';
import { tableColumns } from './db';
import type { MigrationManifest, MigrationStep, TableFingerprint } from './types';
import { MigrationRegistrationError } from './types';

/**
 * Build the composition-owned, per-file manifest. Versions are assigned 1..N
 * by step order; duplicate names are rejected. A conservative fingerprint-based
 * legacy detector is derived from the declared postconditions.
 */
export function buildManifest(file: string, groups: readonly (readonly MigrationStep[])[]): MigrationManifest {
  const steps: MigrationStep[] = [];
  const names = new Set<string>();
  for (const group of groups) {
    for (const step of group) {
      if (names.has(step.name)) throw new MigrationRegistrationError(`Duplicate migration step name: ${step.name}`);
      names.add(step.name);
      if (step.produces.length === 0)
        throw new MigrationRegistrationError(`Step "${step.name}" declares no postcondition`);
      steps.push(step);
    }
  }
  if (steps.length === 0) throw new MigrationRegistrationError(`Manifest for "${file}" declares no migration steps`);

  return { file, steps, detectLegacyVersion: deriveLegacyDetector(steps) };
}

/**
 * Highest contiguous version (1-based) whose step postconditions all hold, or 0
 * when the baseline is unsatisfied.
 */
export function contiguousSatisfiedVersion(db: Database, steps: readonly MigrationStep[]): number {
  for (let v = 1; v <= steps.length; v += 1) {
    if (!stepSatisfied(db, steps[v - 1])) return v - 1;
  }
  return steps.length;
}

export function stepSatisfied(db: Database, step: MigrationStep): boolean {
  return step.produces.every((fingerprint) => {
    const columns = new Set(tableColumns(db, fingerprint.table));
    return fingerprint.columns.every((column) => columns.has(column));
  });
}

/**
 * Conservative detector: an unversioned DB is recognized only when every
 * baseline (first step) table exists with no columns outside the union of all
 * step postconditions, and any other table that happens to be present also has
 * no unexpected columns. The recognized legacy version is the highest
 * contiguous version whose step postconditions hold — so an older DB missing
 * tables/columns introduced by later steps is still adopted, then upgraded.
 * A missing baseline table or any unexpected column ⇒ unknown ⇒ `null`
 * (caller fails with UNKNOWN_LEGACY_SCHEMA).
 */
export function deriveLegacyDetector(steps: readonly MigrationStep[]): (db: Database) => number | null {
  const expected = new Map<string, Set<string>>();
  for (const step of steps) {
    for (const fingerprint of step.produces) {
      if (!expected.has(fingerprint.table)) expected.set(fingerprint.table, new Set());
      for (const column of fingerprint.columns) expected.get(fingerprint.table)?.add(column);
    }
  }
  return (db: Database): number | null => {
    for (const fp of steps[0].produces) {
      if (tableColumns(db, fp.table).length === 0) return null; // a baseline table is missing — unknown
    }
    for (const [table, expectedColumns] of expected) {
      const actual = tableColumns(db, table);
      if (actual.length === 0) continue; // not yet present — fine
      for (const column of actual) {
        if (!expectedColumns.has(column)) return null; // unexpected column — unknown, never guess
      }
    }
    if (!stepSatisfied(db, steps[0])) return null; // baseline incomplete
    return contiguousSatisfiedVersion(db, steps);
  };
}

/** Fingerprint postconditions for a single table. */
export function fingerprint(table: string, columns: readonly string[]): TableFingerprint {
  return { table, columns };
}
