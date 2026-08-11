/**
 * Deterministic hashing for evidence snapshots and deltas (ADR-012).
 *
 * Hashes are computed from canonical serialization so two snapshots captured
 * in different orders or with different key ordering produce the same digest.
 */

import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Compute the content hash of a snapshot from its non-hash fields. */
export function snapshotContentHash(
  snapshot: Omit<
    {
      schemaVersion: string;
      evidenceType: string;
      identity: unknown;
      execution: unknown;
      results: unknown;
      capturedAt: string;
    },
    'contentHash'
  >,
): string {
  return hashJson({
    schemaVersion: snapshot.schemaVersion,
    evidenceType: snapshot.evidenceType,
    identity: snapshot.identity,
    execution: snapshot.execution,
    results: snapshot.results,
    capturedAt: snapshot.capturedAt,
  });
}
