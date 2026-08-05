// OpenCode contract compatibility evidence — verifier-readable records emitted
// by contract checks. Consumes the compatibility engine result and renders a
// deterministic evidence payload plus a human-readable report. Renderer-free.

import type { OpenCodeCompatibilityResult } from './compatibility-engine';

export interface OpenCodeCompatibilityEvidence {
  readonly pinnedChecksum: string;
  readonly candidateChecksum: string;
  readonly compatible: boolean;
  readonly checksumMatches: boolean;
  readonly changeCount: number;
  readonly breakingChanges: readonly { path: string; kind: string; summary: string }[];
  readonly warnings: readonly { path: string; kind: string; summary: string }[];
  readonly checkedAt: string;
  readonly openCodeVersion?: string;
}

export function toCompatibilityEvidence(result: OpenCodeCompatibilityResult): OpenCodeCompatibilityEvidence {
  return {
    pinnedChecksum: result.pinnedSchemaChecksum,
    candidateChecksum: result.candidateSchemaChecksum,
    compatible: result.compatible,
    checksumMatches: result.checksumMatches,
    changeCount: result.changeCount,
    breakingChanges: result.breakingChanges.map(({ path, kind, summary }) => ({ path, kind, summary })),
    warnings: [...result.potentiallyBreaking, ...result.warnings].map(({ path, kind, summary }) => ({
      path,
      kind,
      summary,
    })),
    checkedAt: result.checkedAt,
    openCodeVersion: result.openCodeVersion,
  };
}

/** Render a compact human-readable compatibility report. */
export function renderCompatibilityEvidence(evidence: OpenCodeCompatibilityEvidence): string {
  const lines = [
    `OpenCode contract check: ${evidence.compatible ? 'COMPATIBLE' : 'DRIFT DETECTED'}`,
    `Pinned checksum:    sha256:${evidence.pinnedChecksum}`,
    `Candidate checksum: sha256:${evidence.candidateChecksum}`,
    `Checksum matches:   ${evidence.checksumMatches}`,
    `Change count:       ${evidence.changeCount}`,
    `OpenCode version:   ${evidence.openCodeVersion ?? 'unknown'}`,
  ];
  if (evidence.breakingChanges.length > 0) {
    lines.push('', 'Breaking changes:');
    for (const change of evidence.breakingChanges) lines.push(`  [breaking] ${change.summary}`);
  }
  if (evidence.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const change of evidence.warnings) lines.push(`  [warning] ${change.summary}`);
  }
  return lines.join('\n');
}

/** Derive the contract event type from a check result. */
export function contractEventType(result: OpenCodeCompatibilityResult): string {
  if (!result.compatible) return 'opencode.contract.breaking-change-detected';
  if (!result.checksumMatches) return 'opencode.contract.drift-detected';
  return 'opencode.contract.compatible';
}
