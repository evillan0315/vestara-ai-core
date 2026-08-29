import type { ActivityOrganizationalEffect, ActivityRecord } from './contracts';

/**
 * Effective-state projection (AAR-001, Direction 2).
 *
 * A pure, recomputable function over the append-only activity history. History
 * remains authoritative; this derived state is never persisted — it is always
 * recomputed from the durable records so it can never drift from truth. It
 * answers "what is currently true" (effective attribution, open items, per-unit
 * latest disposition) without reading the whole stream.
 */

export interface EffectiveCorrection {
  readonly originalId: string;
  readonly correctedBy: string;
  readonly latestCorrectionId: string;
  readonly content: string;
  /** Readable description of what was corrected (presentation support). */
  readonly originalContent: string;
}

export interface EffectiveOpenItem {
  readonly id: string;
  readonly effect: ActivityOrganizationalEffect;
  readonly actor: string;
  readonly content: string;
  readonly workflowId?: string;
  readonly sessionId?: string;
}

export interface EffectiveUnitState {
  readonly workflowId?: string;
  readonly sessionId?: string;
  readonly latestEffect?: ActivityOrganizationalEffect;
  readonly lastActivity: string;
  readonly recordCount: number;
}

export interface EffectiveState {
  readonly computedAt: string;
  /** Every original that has been corrected, with its effective attribution. */
  readonly corrections: readonly EffectiveCorrection[];
  /** Holds / findings / recommendations / authorizations not yet resolved. */
  readonly open: readonly EffectiveOpenItem[];
  /** Latest disposition per workflow/session unit. */
  readonly units: readonly EffectiveUnitState[];
  /** Director attention signal: unresolved open items. */
  readonly needsAttention: number;
}

const OPEN_EFFECTS = new Set<ActivityOrganizationalEffect>(['hold', 'finding', 'recommendation']);
const RESOLVING_EFFECTS = new Set<ActivityOrganizationalEffect>([
  'closure',
  'decision',
  'authorization',
  'intervention',
]);

/** A record resolves an earlier open item when it references it or closes its unit. */
function resolves(record: ActivityRecord, item: ActivityRecord): boolean {
  if (record.sequence <= item.sequence) return false;
  if (record.correctionOf === item.id) return true;
  if (record.relatesTo?.includes(item.id)) return true;
  if (RESOLVING_EFFECTS.has(record.effect ?? 'message')) {
    if (record.workflowId !== undefined && record.workflowId === item.workflowId) return true;
    if (record.sessionId !== undefined && record.sessionId === item.sessionId) return true;
  }
  return false;
}

export function projectEffectiveState(records: readonly ActivityRecord[]): EffectiveState {
  const sorted = [...records].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));

  // Effective attribution: the latest correction per corrected original.
  const correctionsByTarget = new Map<string, ActivityRecord[]>();
  for (const record of sorted) {
    if (record.correctionOf !== undefined) {
      const group = correctionsByTarget.get(record.correctionOf) ?? [];
      group.push(record);
      correctionsByTarget.set(record.correctionOf, group);
    }
  }
  const corrections: EffectiveCorrection[] = [];
  for (const [originalId, group] of correctionsByTarget) {
    const latest = group.at(-1);
    if (latest === undefined) continue;
    const original = sorted.find((entry) => entry.id === originalId);
    corrections.push({
      originalId,
      correctedBy: latest.actor.displayName || latest.actor.id,
      latestCorrectionId: latest.id,
      content: latest.kind === 'agent-message' ? latest.content : latest.id,
      originalContent: original !== undefined && original.kind === 'agent-message' ? original.content : originalId,
    });
  }
  corrections.sort((left, right) => left.originalId.localeCompare(right.originalId));

  // Open items: effect-bearing records not resolved by any later record.
  const open: EffectiveOpenItem[] = [];
  for (const item of sorted) {
    if (item.effect === undefined || !OPEN_EFFECTS.has(item.effect)) continue;
    const resolved = sorted.some((later) => resolves(later, item));
    if (resolved) continue;
    open.push({
      id: item.id,
      effect: item.effect,
      actor: item.actor.displayName || item.actor.id,
      content: item.kind === 'agent-message' ? item.content : item.id,
      workflowId: item.workflowId,
      sessionId: item.sessionId,
    });
  }

  // Per-unit latest disposition.
  const unitsByKey = new Map<string, EffectiveUnitState>();
  for (const record of sorted) {
    if (record.workflowId === undefined && record.sessionId === undefined) continue;
    const key = `${record.workflowId ?? ''}|${record.sessionId ?? ''}`;
    const existing = unitsByKey.get(key);
    if (existing === undefined) {
      unitsByKey.set(key, {
        workflowId: record.workflowId,
        sessionId: record.sessionId,
        latestEffect: record.effect,
        lastActivity: record.timestamp,
        recordCount: 1,
      });
    } else {
      unitsByKey.set(key, {
        workflowId: record.workflowId,
        sessionId: record.sessionId,
        latestEffect: record.effect ?? existing.latestEffect,
        lastActivity: record.timestamp > existing.lastActivity ? record.timestamp : existing.lastActivity,
        recordCount: existing.recordCount + 1,
      });
    }
  }
  const units = [...unitsByKey.values()].sort((left, right) => right.lastActivity.localeCompare(left.lastActivity));

  return {
    computedAt: new Date().toISOString(),
    corrections,
    open,
    units,
    needsAttention: open.length,
  };
}
