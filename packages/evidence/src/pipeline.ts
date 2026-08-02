/**
 * EvidencePipeline — PCS-026 §2, §3.
 *
 * Runs collectors, content-addresses evidence, writes an immutable manifest,
 * and assembles a VerificationEvidenceBundle (checks, provenance, replay
 * descriptor, derived confidence). Slice-1 collectors: command, filesystem
 * change set, source diff.
 */

import type { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { ConfidenceEngine } from './confidence';
import type {
  CheckStatus,
  EvidenceCollector,
  EvidenceItem,
  EvidenceOutcome,
  EvidenceProvenance,
  EvidenceReference,
  EvidenceReplayDescriptor,
  ReplayStep,
  VerificationCheckResult,
  VerificationEvidenceBundle,
} from './types';

export interface EvidencePipelineOptions {
  readonly artifacts: ContentAddressedEvidenceStore;
  readonly manifests: ImmutableEvidenceManifestStore;
  readonly collectors?: readonly EvidenceCollector[];
  readonly confidence?: ConfidenceEngine;
  readonly producer?: string;
  readonly environment?: string;
}

export interface BundleCheckInput {
  readonly id: string;
  readonly name: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly durationMs?: number;
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
}

export class EvidencePipeline {
  private readonly artifacts: ContentAddressedEvidenceStore;
  private readonly manifests: ImmutableEvidenceManifestStore;
  private readonly collectors: readonly EvidenceCollector[];
  private readonly confidence: ConfidenceEngine;
  private readonly producer: string;
  private readonly environment: string;

  constructor(options: EvidencePipelineOptions) {
    this.artifacts = options.artifacts;
    this.manifests = options.manifests;
    this.collectors = options.collectors ?? [];
    this.confidence = options.confidence ?? new ConfidenceEngine();
    this.producer = options.producer ?? 'evidence-pipeline';
    this.environment = options.environment ?? 'local';
  }

  async buildBundle(input: BuildBundleInput): Promise<VerificationEvidenceBundle> {
    const createdAt = new Date().toISOString();

    // 1. Collect + normalize evidence from the configured collectors.
    const items = await this.collect(input);

    // 2. Content-address every item.
    const placed = items.map((item) => {
      const ref = this.artifacts.put({
        content: item.content,
        mediaType: item.mediaType,
        kind: item.kind,
        summary: item.summary,
        metadata: { operation: item.operation, relatedTo: item.relatedTo, producer: this.producer },
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

    // 4. Evidence references with provenance.
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
      return {
        ref: ref.digest,
        kind: item.kind,
        mediaType: item.mediaType,
        size: ref.size,
        summary: item.summary,
        provenance,
        relatedTo: item.relatedTo,
      };
    });

    // 5. Checks with run-level evidence attribution (slice-1 coarse mapping;
    //    per-check collector targeting is refined in a later slice).
    const allRefs = evidenceRefs.map((ref) => ref.ref);
    const checks: VerificationCheckResult[] = input.checks.map((check) => ({
      checkId: check.id,
      name: check.name,
      status: check.status,
      summary: check.summary,
      durationMs: check.durationMs,
      evidenceRefs: check.status === 'skipped' ? [] : allRefs,
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

    return {
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
      createdAt,
    };
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
