/**
 * EvidencePipeline — PCS-026 §2, §3.
 *
 * Runs collectors, content-addresses evidence, writes an immutable manifest,
 * and assembles a VerificationEvidenceBundle (checks, provenance, replay
 * descriptor, derived confidence). Slice-1 collectors: command, filesystem
 * change set, source diff.
 */

import type { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import type { BundleStore } from './bundle-store';
import { ConfidenceEngine } from './confidence';
import type {
  CheckStatus,
  EvidenceCollector,
  EvidenceItem,
  EvidenceKind,
  EvidenceOutcome,
  EvidenceProvenance,
  EvidenceReference,
  EvidenceReplayDescriptor,
  ReplayStep,
  VerificationCheckResult,
  VerificationEvidenceBundle,
} from './types';
import { readVisualMetadata } from './visual-ingest';

export interface EvidencePipelineOptions {
  readonly artifacts: ContentAddressedEvidenceStore;
  readonly manifests: ImmutableEvidenceManifestStore;
  readonly collectors?: readonly EvidenceCollector[];
  readonly confidence?: ConfidenceEngine;
  readonly producer?: string;
  readonly environment?: string;
  /** When provided, the finalized bundle is persisted (immutable). */
  readonly bundles?: BundleStore;
}

export interface BundleCheckInput {
  readonly id: string;
  readonly name: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly durationMs?: number;
  /** Evidence kinds that back this check; empty = all collected evidence (coarse). */
  readonly evidenceKinds?: readonly EvidenceKind[];
}

export interface BuildBundleInput {
  readonly executionId: string;
  readonly taskId?: string;
  readonly verifierId: string;
  readonly profileId: string;
  readonly repository: string;
  readonly implementationCommit: string;
  readonly outcome: EvidenceOutcome;
  readonly scope?: readonly string[];
  readonly limitations?: readonly string[];
  readonly checks: readonly BundleCheckInput[];
  readonly uncoveredRisks?: readonly string[];
  readonly workspaceRoot: string;
  readonly changedFiles?: readonly string[];
  readonly correlationId?: string;
  /** Bundle executionId this run corrects (PCS-026 §6). */
  readonly correctionOf?: string;
}

export class EvidencePipeline {
  private readonly artifacts: ContentAddressedEvidenceStore;
  private readonly manifests: ImmutableEvidenceManifestStore;
  private readonly collectors: readonly EvidenceCollector[];
  private readonly confidence: ConfidenceEngine;
  private readonly producer: string;
  private readonly environment: string;
  private readonly bundles?: BundleStore;

  constructor(options: EvidencePipelineOptions) {
    this.artifacts = options.artifacts;
    this.manifests = options.manifests;
    this.collectors = options.collectors ?? [];
    this.confidence = options.confidence ?? new ConfidenceEngine();
    this.producer = options.producer ?? 'evidence-pipeline';
    this.environment = options.environment ?? 'local';
    this.bundles = options.bundles;
  }

  async buildBundle(input: BuildBundleInput): Promise<VerificationEvidenceBundle> {
    const createdAt = new Date().toISOString();

    // 1. Collect + normalize evidence from the configured collectors.
    const items = await this.collect(input);

    // 2. Content-address every item. Item metadata rides alongside the bytes
    //    and never affects the digest (digests hash bytes only). Pipeline
    //    fields stay authoritative over colliding item metadata keys.
    const placed = items.map((item) => {
      const ref = this.artifacts.put({
        content: item.content,
        mediaType: item.mediaType,
        kind: item.kind,
        summary: item.summary,
        metadata: {
          ...item.metadata,
          operation: item.operation,
          relatedTo: item.relatedTo,
          producer: this.producer,
        },
      });
      return { item, ref };
    });

    // 3. Write the immutable manifest.
    const manifest = this.manifests.write({
      runId: input.executionId,
      repository: input.repository,
      implementationCommit: input.implementationCommit,
      verifiedAt: createdAt,
      verifiedBy: input.verifierId,
      scope: input.scope ?? [],
      limitations: input.limitations ?? [],
      commands: placed
        .filter(({ item }) => item.kind === 'command')
        .map(({ item }) => ({ command: item.operation ?? item.summary, output: String(item.content).slice(0, 4096) })),
      artifacts: placed.map(({ ref }) => ref),
      outcome: input.outcome,
      correlationId: input.correlationId ?? input.executionId,
    });

    // 4. Evidence references with provenance. Validated visual metadata passes
    //    through as a descriptive hint; identity stays `ref`, authority stays
    //    provenance + verifier verdict.
    const evidenceRefs: EvidenceReference[] = placed.map(({ item, ref }) => {
      const provenance: EvidenceProvenance = {
        producer: this.producer,
        executionId: input.executionId,
        operation: item.operation,
        createdAt,
        environment: this.environment,
        contentHash: ref.digest,
        relatedTo: item.relatedTo,
      };
      const visual = readVisualMetadata(item.metadata);
      return {
        ref: ref.digest,
        kind: item.kind,
        mediaType: item.mediaType,
        size: ref.size,
        summary: item.summary,
        provenance,
        relatedTo: item.relatedTo,
        ...(visual ? { visual } : {}),
      };
    });

    // 5. Checks with per-check evidence attribution — a check is backed by the
    //    evidence kinds it declares, or all run evidence when none are declared.
    const checks: VerificationCheckResult[] = input.checks.map((check) => ({
      checkId: check.id,
      name: check.name,
      status: check.status,
      summary: check.summary,
      durationMs: check.durationMs,
      evidenceRefs:
        check.status === 'skipped'
          ? []
          : evidenceRefs
              .filter((ref) => !check.evidenceKinds || check.evidenceKinds.includes(ref.kind))
              .map((ref) => ref.ref),
    }));

    // 6. Replay descriptor — deterministic artifact replay only (slice 1).
    const replay = this.replayDescriptor(
      manifest.runId,
      placed.map(({ ref }) => ref.digest),
    );

    // 7. Derived confidence.
    const confidence = this.confidence.compute({
      checks,
      evidenceCount: evidenceRefs.length,
      distinctEvidenceRefs: new Set(evidenceRefs.map((ref) => ref.ref)).size,
      replayableCount: evidenceRefs.length,
      createdAt,
      profileChecksExpected: input.scope?.length,
    });

    const bundle: VerificationEvidenceBundle = {
      id: `bundle-${input.executionId}`,
      executionId: input.executionId,
      taskId: input.taskId,
      verifierId: input.verifierId,
      profileId: input.profileId,
      manifestId: manifest.runId,
      evidence: evidenceRefs,
      checks,
      replay,
      confidence,
      ...(input.correctionOf ? { supersedes: `bundle-${input.correctionOf}` } : {}),
      createdAt,
    };
    if (this.bundles) this.bundles.write(bundle);
    return bundle;
  }
  private async collect(input: BuildBundleInput): Promise<EvidenceItem[]> {
    const items: EvidenceItem[] = [];
    for (const collector of this.collectors) {
      try {
        const result = await collector.collect({
          executionId: input.executionId,
          taskId: input.taskId,
          workspaceRoot: input.workspaceRoot,
          changedFiles: input.changedFiles,
          profile: input.profileId,
        });
        items.push(...result.items);
      } catch {
        // a failing collector must not abort the whole bundle
      }
    }
    return items;
  }

  private replayDescriptor(runId: string, digests: readonly string[]): EvidenceReplayDescriptor {
    const steps: ReplayStep[] = digests.map((digest) => ({ type: 'open-artifact', target: digest }));
    if (steps.length === 0) steps.push({ type: 'open-log', target: runId });
    return { mode: 'artifact', steps, requires: {} };
  }
}
