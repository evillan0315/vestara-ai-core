/**
 * VerifierResultsStore — keeps the most recent verdict per execution so the
 * API can serve override and re-verification requests. Intentional scope: this
 * is a coordination cache, not the authoritative evidence store. Authoritative
 * evidence lives in BundleStore; authoritative manifests live in
 * ImmutableEvidenceManifestStore.
 */

import type { VerifierVerdict } from '@vestara/evidence';

export class VerifierResultsStore {
  private readonly results = new Map<string, VerifierVerdict>();

  record(verdict: VerifierVerdict): void {
    this.results.set(verdict.executionId, verdict);
  }

  read(executionId: string): VerifierVerdict | undefined {
    return this.results.get(executionId);
  }

  has(executionId: string): boolean {
    return this.results.has(executionId);
  }

  list(): VerifierVerdict[] {
    return [...this.results.values()].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  }
}
