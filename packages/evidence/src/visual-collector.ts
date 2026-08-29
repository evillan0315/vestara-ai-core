/**
 * PCS-026 §4, §9 — screenshot + visual comparison collector.
 *
 * Captures a screenshot through an injected ScreenshotSource (a browser
 * adapter such as Playwright), content-addresses it, and compares it against
 * the approved baseline for the scenario. Baseline promotion is a governance
 * action (BaselineStore.approve/reject); this collector never promotes.
 */

import { createHash } from 'node:crypto';
import type { ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import type { BaselineStore } from './baseline-store';
import type { EvidenceCollectionRequest, EvidenceCollector, EvidenceItem } from './types';
import { VisualComparisonEngine, type VisualComparisonOptions } from './visual';

export interface ScreenshotSource {
  readonly name: string;
  captureScreenshot(input: {
    readonly url: string;
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly theme?: string;
  }): Promise<Uint8Array>;
}

export interface VisualScenario {
  readonly url: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly theme?: string;
  readonly tolerance?: number;
}

export type VisualComparisonStatus = 'pass' | 'fail' | 'needs-review';

export interface VisualEvidenceCollectorOptions {
  readonly source: ScreenshotSource;
  readonly baselines: BaselineStore;
  readonly artifacts: ContentAddressedEvidenceStore;
  readonly scenario: VisualScenario;
  readonly comparison?: VisualComparisonOptions;
  readonly engine?: VisualComparisonEngine;
}

export class VisualEvidenceCollector implements EvidenceCollector {
  readonly kind = 'screenshot' as const;

  private readonly source: ScreenshotSource;
  private readonly baselines: BaselineStore;
  private readonly artifacts: ContentAddressedEvidenceStore;
  private readonly scenario: VisualScenario;
  private readonly comparison: VisualComparisonOptions;
  private readonly engine: VisualComparisonEngine;

  constructor(options: VisualEvidenceCollectorOptions) {
    this.source = options.source;
    this.baselines = options.baselines;
    this.artifacts = options.artifacts;
    this.scenario = options.scenario;
    this.comparison = options.comparison ?? {};
    this.engine = options.engine ?? new VisualComparisonEngine();
  }

  scenarioKey(): string {
    const viewport = this.scenario.viewport;
    return `${this.scenario.url}@${viewport ? `${viewport.width}x${viewport.height}` : 'auto'}@${this.scenario.theme ?? 'dark'}`;
  }

  async collect(_request: EvidenceCollectionRequest): Promise<{ items: EvidenceItem[] }> {
    const image = await this.source.captureScreenshot({
      url: this.scenario.url,
      viewport: this.scenario.viewport,
      theme: this.scenario.theme,
    });
    const key = this.scenarioKey();
    const digest = createHash('sha256').update(Buffer.from(image)).digest('hex');

    const screenshotItem: EvidenceItem = {
      kind: 'screenshot',
      mediaType: 'image/png',
      content: image,
      summary: `screenshot: ${this.scenario.url}`,
      operation: `screenshot:${this.scenario.url}`,
      relatedTo: [`scenario:${key}`],
    };

    const baseline = this.baselines.get(key);
    let comparisonItem: EvidenceItem;
    if (baseline?.status === 'approved' && baseline.artifactDigest) {
      const baselineBytes = this.artifacts.read(baseline.artifactDigest);
      const status: VisualComparisonStatus = baselineBytes
        ? this.engine.compare(image, baselineBytes, this.comparison).withinTolerance
          ? 'pass'
          : 'fail'
        : 'needs-review';
      comparisonItem = {
        kind: 'visual-comparison',
        mediaType: 'application/json',
        content: JSON.stringify({
          scenarioKey: key,
          status,
          baselineDigest: baseline.artifactDigest,
          candidateDigest: digest,
          tolerance: this.comparison.tolerance ?? 0.001,
        }),
        summary: `visual comparison: ${this.scenario.url} → ${status}`,
        operation: `visual-comparison:${this.scenario.url}`,
        relatedTo: [`scenario:${key}`],
      };
    } else {
      // No approved baseline → record the candidate for human review.
      this.baselines.recordCandidate(key, digest);
      comparisonItem = {
        kind: 'visual-comparison',
        mediaType: 'application/json',
        content: JSON.stringify({
          scenarioKey: key,
          status: 'needs-review',
          baselineDigest: baseline?.artifactDigest ?? null,
          candidateDigest: digest,
          reason: 'no approved baseline — human review required',
        }),
        summary: `visual comparison: ${this.scenario.url} → needs-review (no baseline)`,
        operation: `visual-comparison:${this.scenario.url}`,
        relatedTo: [`scenario:${key}`],
      };
    }

    return { items: [screenshotItem, comparisonItem] };
  }
}
