/**
 * VESTARA-INTELLIGENCE OBS-1: Observer Authority
 *
 * Subscribes to diagnostic output via EventBus and produces structured
 * ObserverFinding records. Read-only to all authority stores.
 *
 * Invariants:
 * - INV-OBS-1: Observer cannot write to authority stores
 * - INV-OBS-2: Findings reference facts, never duplicate them
 * - INV-OBS-3: Observer does not trigger execution
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  DiagnosticSeverity,
  DiagnosticSnapshot,
  DiagnosticSourceHealth,
  ObserverConfig,
  ObserverConfidenceLevel,
  ObserverEventType,
  ObserverFinding,
  ObserverFindingStatus,
  ObserverFindingStore,
  ObserverSnapshotRef,
} from '@vestara/types';
import { DEFAULT_OBSERVER_CONFIG } from '@vestara/types';

/**
 * OBS-1: Observer Authority
 *
 * The Observer subscribes to diagnostic snapshot events via EventBus and
 * produces ObserverFinding records. It is read-only to all authority stores
 * (Workflow, Routing, Activity, Conversation).
 *
 * The Observer does not:
 * - Write to authority stores (INV-OBS-1)
 * - Duplicate diagnostic facts (INV-OBS-2)
 * - Trigger execution (INV-OBS-3)
 * - Make routing or governance decisions
 *
 * The Observer does:
 * - Analyze diagnostic snapshots for anomalies
 * - Produce findings with confidence scores
 * - Track finding lifecycle (observation → hypothesis → diagnosis)
 * - Detect degradation trends (OBS-4)
 */
export class Observer {
  private config: ObserverConfig;
  private store: ObserverFindingStore;
  private findings: Map<string, ObserverFinding> = new Map();
  private unsubscribeFn: (() => void) | null = null;

  constructor(config: Partial<ObserverConfig> = {}, store?: ObserverFindingStore) {
    this.config = { ...DEFAULT_OBSERVER_CONFIG, ...config };
    this.store = store ?? new InMemoryFindingStore();
  }

  /**
   * OBS-1: Subscribe to diagnostic snapshot events on the EventBus.
   * When a snapshot arrives, the Observer analyzes it and may produce a finding.
   */
  subscribe(eventBus: { subscribe: (pattern: string, handler: (event: any) => Promise<void>) => () => void }): void {
    this.unsubscribeFn = eventBus.subscribe('diagnostic.snapshot', async (event: any) => {
      const snapshot = event.payload?.snapshot as DiagnosticSnapshot | undefined;
      if (snapshot) {
        await this.analyzeSnapshot(snapshot);
      }
    });
  }

  /**
   * OBS-1: Unsubscribe from the EventBus.
   */
  unsubscribe(): void {
    this.unsubscribeFn?.();
    this.unsubscribeFn = null;
  }

  /**
   * OBS-1: Analyze a diagnostic snapshot and produce a finding if warranted.
   * This is the core analytical loop of the Observer.
   */
  async analyzeSnapshot(snapshot: DiagnosticSnapshot): Promise<ObserverFinding | null> {
    // Skip if Observer is disabled
    if (!this.config.enabled) return null;

    // Skip if source is not in monitor list (empty = all sources)
    if (
      this.config.monitorSources.length > 0 &&
      !this.config.monitorSources.includes(snapshot.source.id)
    ) {
      return null;
    }

    // Skip if severity is below threshold
    if (!this.meetsSeverityThreshold(snapshot.severity)) {
      return null;
    }

    // Analyze the snapshot and compute confidence
    const analysis = this.analyzeSnapshotHealth(snapshot);

    // Skip if confidence is too low
    if (analysis.confidence < 0.1) {
      return null;
    }

    // Check if we already have a finding for this source
    const existingFinding = this.findingsBySource.get(snapshot.source.id);

    if (existingFinding) {
      // Update existing finding with new evidence
      return this.updateFinding(existingFinding, snapshot, analysis);
    } else {
      // Create new finding
      return this.createFinding(snapshot, analysis);
    }
  }

  /**
   * OBS-1: Analyze the health state of a snapshot and compute confidence.
   */
  private analyzeSnapshotHealth(snapshot: DiagnosticSnapshot): {
    confidence: number;
    confidenceLevel: ObserverConfidenceLevel;
    description: string;
  } {
    const health = snapshot.health;
    const severity = snapshot.severity;

    let confidence = 0;
    let description = '';

    // Higher severity = higher confidence in the finding
    switch (severity) {
      case 'critical':
        confidence = 0.9;
        description = `Critical issue detected in ${snapshot.source.name}`;
        break;
      case 'error':
        confidence = 0.7;
        description = `Error detected in ${snapshot.source.name}`;
        break;
      case 'warning':
        confidence = 0.4;
        description = `Warning detected in ${snapshot.source.name}`;
        break;
      case 'info':
      default:
        confidence = 0.1;
        description = `Informational observation in ${snapshot.source.name}`;
        break;
    }

    // Adjust confidence based on health state
    switch (health) {
      case 'unhealthy':
        confidence = Math.min(1, confidence + 0.2);
        break;
      case 'degraded':
        confidence = Math.min(1, confidence + 0.1);
        break;
      case 'healthy':
        confidence = Math.max(0, confidence - 0.3);
        description = `Source ${snapshot.source.name} is operating normally`;
        break;
      case 'unknown':
      default:
        // Unknown health reduces confidence slightly
        confidence = Math.max(0, confidence - 0.1);
        break;
    }

    const confidenceLevel = this.scoreToLevel(confidence);

    return { confidence, confidenceLevel, description };
  }

  /**
   * OBS-1: Convert a numeric confidence score to a level label.
   */
  private scoreToLevel(score: number): ObserverConfidenceLevel {
    if (score >= 0.8) return 'very-high';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'moderate';
    return 'low';
  }

  /**
   * OBS-1: Convert a DiagnosticSeverity to an ObserverFindingStatus.
   */
  private severityToStatus(severity: DiagnosticSeverity): ObserverFindingStatus {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'observation';
      case 'warning':
        return 'observation';
      case 'info':
      default:
        return 'observation';
    }
  }

  /**
   * OBS-1: Check if a severity meets the configured threshold.
   */
  private meetsSeverityThreshold(severity: DiagnosticSeverity): boolean {
    const levels: DiagnosticSeverity[] = ['info', 'warning', 'error', 'critical'];
    const minIndex = levels.indexOf(this.config.minSeverity);
    const severityIndex = levels.indexOf(severity);
    return severityIndex >= minIndex;
  }

  /**
   * OBS-1: Create a snapshot reference from a DiagnosticSnapshot.
   */
  private createSnapshotRef(snapshot: DiagnosticSnapshot): ObserverSnapshotRef {
    return {
      sourceId: snapshot.source.id,
      observedAt: snapshot.observedAt,
      summary: snapshot.message,
      health: snapshot.health,
    };
  }

  /**
   * OBS-1: Create a new finding from a snapshot.
   */
  private async createFinding(
    snapshot: DiagnosticSnapshot,
    analysis: { confidence: number; confidenceLevel: ObserverConfidenceLevel; description: string },
  ): Promise<ObserverFinding> {
    const now = new Date().toISOString();
    const finding: ObserverFinding = {
      id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Observation: ${snapshot.source.name}`,
      description: analysis.description,
      status: 'observation',
      severity: snapshot.severity,
      confidence: analysis.confidence,
      confidenceLevel: analysis.confidenceLevel,
      sourceIds: [snapshot.source.id],
      snapshotRefs: [this.createSnapshotRef(snapshot)],
      evidenceBundleRefs: snapshot.evidenceRefs?.map((r: { bundleId: string }) => r.bundleId) ?? [],
      observedAt: now,
      updatedAt: now,
    };

    this.findings.set(finding.id, finding);
    this.findingsBySource.set(snapshot.source.id, finding);

    return finding;
  }

  /**
   * OBS-1: Update an existing finding with new evidence.
   */
  private async updateFinding(
    finding: ObserverFinding,
    snapshot: DiagnosticSnapshot,
    analysis: { confidence: number; confidenceLevel: ObserverConfidenceLevel; description: string },
  ): Promise<ObserverFinding> {
    const now = new Date().toISOString();
    const updated: ObserverFinding = {
      ...finding,
      description: `${finding.description}; ${analysis.description}`,
      severity: this.maxSeverity(finding.severity, snapshot.severity),
      confidence: Math.max(finding.confidence, analysis.confidence),
      confidenceLevel: this.scoreToLevel(Math.max(finding.confidence, analysis.confidence)),
      snapshotRefs: [...finding.snapshotRefs, this.createSnapshotRef(snapshot)],
      evidenceBundleRefs: [
        ...new Set([
          ...finding.evidenceBundleRefs,
          ...(snapshot.evidenceRefs?.map((r: { bundleId: string }) => r.bundleId) ?? []),
        ]),
      ],
      updatedAt: now,
    };

    this.findings.set(finding.id, updated);
    if (snapshot.source.id) {
      this.findingsBySource.set(snapshot.source.id, updated);
    }

    return updated;
  }

  /**
   * OBS-1: Get the maximum of two severities.
   */
  private maxSeverity(a: DiagnosticSeverity, b: DiagnosticSeverity): DiagnosticSeverity {
    const levels: DiagnosticSeverity[] = ['info', 'warning', 'error', 'critical'];
    return levels[Math.max(levels.indexOf(a), levels.indexOf(b))];
  }

  private findingsBySource: Map<string, ObserverFinding> = new Map();
}

/**
 * OBS-1: In-memory implementation of ObserverFindingStore.
 * For production use, this would be backed by a database.
 */
class InMemoryFindingStore implements ObserverFindingStore {
  private findings: Map<string, ObserverFinding> = new Map();

  async getFinding(id: string): Promise<ObserverFinding | null> {
    return this.findings.get(id) ?? null;
  }

  async listFindings(status?: ObserverFindingStatus): Promise<readonly ObserverFinding[]> {
    const all = Array.from(this.findings.values());
    if (status) {
      return all.filter((f) => f.status === status);
    }
    return all;
  }

  async getFindingsBySource(sourceId: string): Promise<readonly ObserverFinding[]> {
    return Array.from(this.findings.values()).filter((f) => f.sourceIds.includes(sourceId));
  }

  async getFindingsByTimeRange(start: string, end: string): Promise<readonly ObserverFinding[]> {
    const startDate = new Date(start).getTime();
    const endDate = new Date(end).getTime();
    return Array.from(this.findings.values()).filter((f) => {
      const observedAt = new Date(f.observedAt).getTime();
      return observedAt >= startDate && observedAt <= endDate;
    });
  }

  async getActiveCount(): Promise<number> {
    return Array.from(this.findings.values()).filter(
      (f) => f.status === 'observation' || f.status === 'hypothesis',
    ).length;
  }
}
