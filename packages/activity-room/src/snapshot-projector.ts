/**
 * AR-SNAPSHOT-002: M11A SnapshotProjector.
 *
 * Explicit snapshot-membership boundary between reusable M10 StreamItem
 * material and the M11A snapshot transport (frozen ownership decision
 * AR-SNAPSHOT-001B). Selects newest-N projectable Activity entities with
 * correlated operations attached, preserving the independent sequence
 * frontier and canonical ascending order.
 *
 * Canonical invariants (AR-SNAPSHOT-001B §12):
 *   Observation ≠ StreamItem ≠ ActivityEntity ≠ Operation.
 *   Correlated operations consume ZERO Activity-entity snapshot slots.
 *   Snapshot frontier is independent of projected entity cardinality.
 *
 * Package-owned pure selection logic: retrieval is injected (M11A binds the
 * existing M9 backward-history query), so this module depends on neither the
 * API nor the UI. Ordinary M10 stream semantics are untouched.
 */

import type { ActivityRecord } from './m9-types';
import type { StreamItem } from './projection-types';

/** Requested Activity-entity capacity of one snapshot (same N as the legacy raw window). */
export const SNAPSHOT_ENTITY_CAPACITY = 50;

/** History page size reused from the existing backward-pagination contract. */
export const SNAPSHOT_SCAN_PAGE_SIZE = 50;

/**
 * Hard cap on backward scan pages per snapshot. Paging is demand-driven and
 * stops far earlier in the common case (once N entities are selected and a
 * trailing page contributes nothing attachable); the cap only bounds
 * pathological densities. It is a page budget over the existing history
 * query, not an over-fetch window: pages are fetched lazily and only while
 * selection is incomplete.
 */
export const MAX_SNAPSHOT_SCAN_PAGES = 20;

export interface SnapshotProjectorDeps {
  /** Newest-first-bounded backward page; existing M9 history-query semantics. */
  fetchPage: (beforeSequence: number, limit: number) => Promise<readonly ActivityRecord[]>;
  /** Stateless record → StreamItem mapping (M10 narrow capability). */
  projectRecord: (record: ActivityRecord) => StreamItem;
}

export interface SnapshotProjectorOptions {
  /** Projectable-entity capacity N. Defaults to SNAPSHOT_ENTITY_CAPACITY. */
  readonly capacity?: number;
  /** Rows per history page. Defaults to SNAPSHOT_SCAN_PAGE_SIZE. */
  readonly pageSize?: number;
  /** Hard page budget. Defaults to MAX_SNAPSHOT_SCAN_PAGES. */
  readonly maxPages?: number;
  /** Exclusive upper bound: select records with sequence < startBefore. */
  readonly startBefore: number;
}

export interface SnapshotSelection {
  /**
   * Selected snapshot rows in canonical ascending sequence order: the newest
   * projectable parent entities (up to capacity) plus every tool-lifecycle
   * row observed during the bounded scan. Unattached tool rows remain
   * recoverable evidence, list-excluded by presentation exactly as before.
   */
  readonly items: readonly StreamItem[];
  /** Projectable parent entities with authoritative operation membership. */
  readonly entities: readonly SnapshotActivityEntity[];
  /** Projectable parent entity count (tool rows consume zero slots). */
  readonly entityCount: number;
  /**
   * True only when durable history was exhausted within the fixed page budget,
   * proving that selected parent operation membership is closed. False means
   * the bounded scan stopped before that proof was available.
   */
  readonly complete: boolean;
  /** Oldest selected entity sequence, for history-composition diagnostics. */
  readonly oldestEntitySequence: number | null;
}

export type SnapshotOperationStatus = 'started' | 'completed' | 'failed';

export interface SnapshotOperation {
  readonly operationId: string;
  readonly toolName: string;
  readonly status: SnapshotOperationStatus;
  readonly timestamp: string;
  readonly activityIds: readonly string[];
  readonly output?: string;
  readonly executionId?: string;
  readonly runtimeSessionBindingId?: string;
  readonly conversationId?: string;
}

export interface SnapshotActivityEntity {
  readonly parent: StreamItem;
  readonly lineageKey: string | null;
  readonly operations: readonly SnapshotOperation[];
}

function isToolItem(item: StreamItem): boolean {
  return item.kind === 'tool-call' || item.kind === 'tool-result';
}

/**
 * Authoritative lineage keys shared with client correlation
 * (deriveCorrelatedSessions): execution, runtime session, origin
 * conversation. A tool row attaches to a selected entity sharing any key.
 */
function lineageKeysOf(
  item: Pick<StreamItem, 'executionId' | 'runtimeSessionBindingId' | 'originConversationId'>,
): readonly string[] {
  const keys: string[] = [];
  if (item.executionId) keys.push(`execution:${item.executionId}`);
  if (item.runtimeSessionBindingId) keys.push(`session:${item.runtimeSessionBindingId}`);
  if (item.originConversationId) keys.push(`conversation:${item.originConversationId}`);
  return keys;
}

function parentPriority(item: StreamItem): number {
  if (item.kind === 'interaction') return 0;
  if (item.kind === 'conversation') return 3;
  if (item.kind === 'activity' || item.kind === 'progress') return 2;
  return 1;
}

function operationStatus(item: StreamItem): SnapshotOperationStatus | undefined {
  return item.tool?.status;
}

function chooseParent(
  tool: StreamItem,
  entities: readonly StreamItem[],
): { item: StreamItem; key: string } | undefined {
  const candidates = entities.flatMap((entity) =>
    lineageKeysOf(entity)
      .filter((key) => lineageKeysOf(tool).includes(key))
      .map((key) => ({ item: entity, key })),
  );
  candidates.sort(
    (a, b) => parentPriority(b.item) - parentPriority(a.item) || a.item.sequenceNumber - b.item.sequenceNumber,
  );
  return candidates[0];
}

function attachOperations(
  entities: readonly StreamItem[],
  tools: readonly StreamItem[],
): readonly SnapshotActivityEntity[] {
  const operations = new Map<string, Map<string, SnapshotOperation>>();
  const operationSequences = new Map<string, Map<string, number>>();
  const entityKeys = new Map<string, string>();

  for (const entity of entities) {
    const key = lineageKeysOf(entity)[0] ?? null;
    if (key) entityKeys.set(entity.streamItemId, key);
    operations.set(entity.streamItemId, new Map());
    operationSequences.set(entity.streamItemId, new Map());
  }

  for (const tool of tools) {
    const callID = tool.tool?.callID;
    const status = operationStatus(tool);
    if (!callID || !status) continue;
    const parent = chooseParent(tool, entities);
    if (!parent) continue;
    const byOperation = operations.get(parent.item.streamItemId);
    const sequenceByOperation = operationSequences.get(parent.item.streamItemId);
    if (!byOperation || !sequenceByOperation) continue;
    const prior = byOperation.get(callID);
    const priorSequence = sequenceByOperation.get(callID);
    const isNewerLifecycle = priorSequence === undefined || tool.sequenceNumber >= priorSequence;
    byOperation.set(callID, {
      operationId: callID,
      toolName: isNewerLifecycle ? (tool.tool?.toolName ?? prior?.toolName ?? 'tool') : (prior?.toolName ?? 'tool'),
      status: isNewerLifecycle ? status : (prior?.status ?? status),
      timestamp: isNewerLifecycle ? tool.timestamp : (prior?.timestamp ?? tool.timestamp),
      activityIds: [...new Set([...(prior?.activityIds ?? []), tool.activityId])],
      ...((tool.tool?.output ?? prior?.output) ? { output: tool.tool?.output ?? prior?.output } : {}),
      ...((tool.executionId ?? prior?.executionId) ? { executionId: tool.executionId ?? prior?.executionId } : {}),
      ...((tool.runtimeSessionBindingId ?? prior?.runtimeSessionBindingId)
        ? { runtimeSessionBindingId: tool.runtimeSessionBindingId ?? prior?.runtimeSessionBindingId }
        : {}),
      ...((tool.originConversationId ?? prior?.conversationId)
        ? { conversationId: tool.originConversationId ?? prior?.conversationId }
        : parent.item.originConversationId
          ? { conversationId: parent.item.originConversationId }
          : {}),
    });
    sequenceByOperation.set(callID, Math.max(priorSequence ?? Number.NEGATIVE_INFINITY, tool.sequenceNumber));
  }

  return entities.map((parent) => ({
    parent,
    lineageKey: entityKeys.get(parent.streamItemId) ?? null,
    operations: [...(operations.get(parent.streamItemId)?.values() ?? [])],
  }));
}

/**
 * Select newest-N projectable Activity entities with correlated operations.
 *
 * Entity = any non-tool StreamItem (conversation, activity, progress, log,
 * telemetry, evidence, diagnostic, interaction — presentation decides
 * visibility; recovery must not). Tool rows never consume entity slots; they
 * travel as attachable evidence. Deterministic for fixed material: newest
 * entities win, ties impossible (sequences unique), output ascending.
 */
export async function projectActivitySnapshot(
  deps: SnapshotProjectorDeps,
  options: SnapshotProjectorOptions,
): Promise<SnapshotSelection> {
  const capacity = options.capacity ?? SNAPSHOT_ENTITY_CAPACITY;
  const pageSize = options.pageSize ?? SNAPSHOT_SCAN_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_SNAPSHOT_SCAN_PAGES;

  const entities: StreamItem[] = [];
  const scannedTools: StreamItem[] = [];
  let cursor = options.startBefore;
  let pages = 0;
  let exhausted = false;

  for (;;) {
    if (pages >= maxPages) break;
    const page = await deps.fetchPage(cursor, pageSize);
    pages += 1;
    if (page.length === 0) {
      exhausted = true;
      break;
    }
    // Pages arrive in canonical ascending order; selection walks newest-first.
    for (let index = page.length - 1; index >= 0; index -= 1) {
      const record = page[index]!;
      const item = deps.projectRecord(record);
      if (isToolItem(item)) {
        scannedTools.push(item);
        continue;
      }
      if (entities.length < capacity) {
        entities.push(item);
      }
    }
    cursor = page[0]!.sequenceNumber;
  }

  const items = [...entities, ...scannedTools].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return {
    items,
    entities: attachOperations(entities, scannedTools),
    entityCount: entities.length,
    complete: exhausted,
    oldestEntitySequence: entities.length > 0 ? entities[entities.length - 1]!.sequenceNumber : null,
  };
}
