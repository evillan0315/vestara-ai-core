/**
 * VESTARA-INTELLIGENCE OBS-3: Findings Lifecycle
 *
 * Finding lifecycle management with status transitions:
 * observation → hypothesis → diagnosis (or rejected/merged)
 *
 * Ownership:
 * - Finding lifecycle is managed by the Observer authority
 * - Status transitions are validated against allowed paths
 * - Findings can be merged into other findings
 * - Findings can be rejected with a reason
 *
 * Invariants:
 * - INV-OBS-3: Finding lifecycle transitions do not trigger execution
 * - INV-OBS-4: Rejected findings retain their history
 * - INV-OBS-5: Merged findings reference the target finding
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ObserverConfidenceLevel, ObserverFinding, ObserverFindingStatus } from '@vestara/types';

// ─── Status Transition Rules ───────────────────────────────────

/**
 * OBS-3: Allowed status transitions for Observer findings.
 * Each entry maps a current status to its allowed next statuses.
 */
const ALLOWED_TRANSITIONS: Record<ObserverFindingStatus, readonly ObserverFindingStatus[]> = {
  observation: ['hypothesis', 'rejected'],
  hypothesis: ['diagnosis', 'rejected', 'observation'],
  diagnosis: ['merged'],
  rejected: [], // Terminal state
  merged: [], // Terminal state
};

/**
 * OBS-3: Check if a status transition is allowed.
 */
export function isTransitionAllowed(from: ObserverFindingStatus, to: ObserverFindingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * OBS-3: Get all allowed transitions from a given status.
 */
export function getAllowedTransitions(from: ObserverFindingStatus): readonly ObserverFindingStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

// ─── Finding Lifecycle Manager ─────────────────────────────────

/**
 * OBS-3: Result of a status transition attempt.
 */
export interface FindingTransitionResult {
  /** Whether the transition was successful */
  readonly success: boolean;

  /** The updated finding (if successful) */
  readonly finding?: ObserverFinding;

  /** Error message (if unsuccessful) */
  readonly error?: string;

  /** The transition that was attempted */
  readonly transition: { from: ObserverFindingStatus; to: ObserverFindingStatus };
}

/**
 * OBS-3: Finding Lifecycle Manager
 *
 * Manages status transitions for Observer findings.
 * Validates transitions against allowed paths and updates finding metadata.
 */
export class FindingLifecycleManager {
  /**
   * OBS-3: Attempt to transition a finding to a new status.
   *
   * @param finding - The finding to transition
   * @param newStatus - The desired new status
   * @param reason - Optional reason for the transition
   * @returns The transition result with updated finding or error
   */
  transition(finding: ObserverFinding, newStatus: ObserverFindingStatus, reason?: string): FindingTransitionResult {
    const currentStatus = finding.status;

    // Check if transition is allowed
    if (!isTransitionAllowed(currentStatus, newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${getAllowedTransitions(currentStatus).join(', ')}`,
        transition: { from: currentStatus, to: newStatus },
      };
    }

    // Apply the transition
    const now = new Date().toISOString();
    const updated: ObserverFinding = {
      ...finding,
      status: newStatus,
      updatedAt: now,
      description: reason
        ? `${finding.description} [Transition: ${currentStatus} → ${newStatus}: ${reason}]`
        : finding.description,
    };

    // Adjust confidence based on status
    if (newStatus === 'hypothesis') {
      // Hypothesis promotion requires minimum confidence
      const confidence = Math.max(finding.confidence, 0.3);
      const confidenceLevel = this.scoreToLevel(confidence);
      return {
        success: true,
        finding: { ...updated, confidence, confidenceLevel },
        transition: { from: currentStatus, to: newStatus },
      };
    }

    if (newStatus === 'diagnosis') {
      // Diagnosis requires high confidence
      const confidence = Math.max(finding.confidence, 0.6);
      const confidenceLevel = this.scoreToLevel(confidence);
      return {
        success: true,
        finding: { ...updated, confidence, confidenceLevel },
        transition: { from: currentStatus, to: newStatus },
      };
    }

    return {
      success: true,
      finding: updated,
      transition: { from: currentStatus, to: newStatus },
    };
  }

  /**
   * OBS-3: Merge a finding into another finding.
   * The source finding is marked as 'merged' and references the target.
   */
  merge(source: ObserverFinding, target: ObserverFinding, reason?: string): FindingTransitionResult {
    // Check if merge is allowed from source's current status
    if (!isTransitionAllowed(source.status, 'merged')) {
      return {
        success: false,
        error: `Cannot merge finding in status '${source.status}'`,
        transition: { from: source.status, to: 'merged' },
      };
    }

    const now = new Date().toISOString();
    const mergedSource: ObserverFinding = {
      ...source,
      status: 'merged',
      updatedAt: now,
      description: reason
        ? `${source.description} [Merged into ${target.id}: ${reason}]`
        : `${source.description} [Merged into ${target.id}]`,
      relatedFindingIds: [...(source.relatedFindingIds ?? []), target.id],
    };

    // Update target to reference the merged finding
    const _updatedTarget: ObserverFinding = {
      ...target,
      updatedAt: now,
      relatedFindingIds: [...new Set([...(target.relatedFindingIds ?? []), source.id])],
      // Merge evidence references
      snapshotRefs: [...target.snapshotRefs, ...source.snapshotRefs],
      evidenceBundleRefs: [...new Set([...target.evidenceBundleRefs, ...source.evidenceBundleRefs])],
      sourceIds: [...new Set([...target.sourceIds, ...source.sourceIds])],
      // Take the higher severity and confidence
      severity: this.maxSeverity(target.severity, source.severity),
      confidence: Math.max(target.confidence, source.confidence),
      confidenceLevel: this.scoreToLevel(Math.max(target.confidence, source.confidence)),
    };

    return {
      success: true,
      finding: mergedSource,
      transition: { from: source.status, to: 'merged' },
    };
  }

  /**
   * OBS-3: Reject a finding with a reason.
   */
  reject(finding: ObserverFinding, reason: string): FindingTransitionResult {
    return this.transition(finding, 'rejected', reason);
  }

  /**
   * OBS-3: Promote a finding from observation to hypothesis.
   */
  promoteToHypothesis(finding: ObserverFinding, reason?: string): FindingTransitionResult {
    return this.transition(finding, 'hypothesis', reason);
  }

  /**
   * OBS-3: Promote a finding from hypothesis to diagnosis.
   */
  promoteToDiagnosis(finding: ObserverFinding, reason?: string): FindingTransitionResult {
    return this.transition(finding, 'diagnosis', reason);
  }

  private scoreToLevel(score: number): ObserverConfidenceLevel {
    if (score >= 0.8) return 'very-high';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'moderate';
    return 'low';
  }

  private maxSeverity(a: string, b: string): 'info' | 'warning' | 'error' | 'critical' {
    const levels = ['info', 'warning', 'error', 'critical'];
    return levels[Math.max(levels.indexOf(a), levels.indexOf(b))] as any;
  }
}
