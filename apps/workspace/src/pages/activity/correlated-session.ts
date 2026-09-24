import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

export type CorrelatedOperationStatus = 'started' | 'completed' | 'failed';

export interface CorrelatedOperation {
  readonly operationId: string;
  readonly toolName: string;
  readonly status: CorrelatedOperationStatus;
  readonly timestamp: string;
  readonly activityIds: readonly string[];
  readonly output?: string;
  readonly executionId?: string;
  readonly runtimeSessionBindingId?: string;
  readonly conversationId?: string;
}

export interface CorrelatedSession {
  /** Presentation key derived from authoritative lineage; not a new authority. */
  readonly lineageKey: string;
  readonly status: 'working' | 'completed' | 'failed';
  readonly operations: readonly CorrelatedOperation[];
  readonly conversationId?: string;
}

function lineageKeys(item: M11CStreamItem): readonly string[] {
  return [
    item.executionId ? `execution:${item.executionId}` : undefined,
    item.runtimeSessionBindingId ? `session:${item.runtimeSessionBindingId}` : undefined,
    item.originConversationId ? `conversation:${item.originConversationId}` : undefined,
  ].filter((key): key is string => key !== undefined);
}

function isTool(item: M11CStreamItem): boolean {
  return item.kind === 'tool-call' || item.kind === 'tool-result';
}

function parentPriority(item: M11CStreamItem): number {
  if (item.kind === 'interaction') return 0;
  if (item.kind === 'conversation') return 3;
  if (item.kind === 'activity' || item.kind === 'progress') return 2;
  return 1;
}

/**
 * Derive the human-facing work/session view from the existing M11C stream.
 *
 * Grouping is fail-closed: a tool needs a canonical callID, a supported
 * lineage key, and a non-tool parent with the same exact lineage key. Items
 * without all three remain ordinary top-level stream items.
 */
export function deriveCorrelatedSessions(items: readonly M11CStreamItem[]): M11CStreamItem[] {
  const parents = new Map<string, M11CStreamItem>();
  for (const item of items) {
    if (isTool(item)) continue;
    if (parentPriority(item) === 0) continue;
    for (const key of lineageKeys(item)) {
      const current = parents.get(key);
      if (!current || parentPriority(item) > parentPriority(current) || item.sequence < current.sequence) {
        parents.set(key, item);
      }
    }
  }

  const operationsByLineage = new Map<string, Map<string, CorrelatedOperation>>();
  const hiddenIds = new Set<string>();
  for (const item of items) {
    if (!isTool(item) || !item.tool?.callID) continue;
    const key = lineageKeys(item).find((candidate) => parents.has(candidate));
    if (!key || !parents.has(key)) continue;
    const parent = parents.get(key);

    const byOperation = operationsByLineage.get(key) ?? new Map<string, CorrelatedOperation>();
    const prior = byOperation.get(item.tool.callID);
    byOperation.set(item.tool.callID, {
      operationId: item.tool.callID,
      toolName: item.tool.toolName,
      status: item.tool.status,
      timestamp: item.timestamp,
      activityIds: [...(prior?.activityIds ?? []), item.id],
      ...(item.tool.output ? { output: item.tool.output } : prior?.output ? { output: prior.output } : {}),
      ...(item.executionId ? { executionId: item.executionId } : prior?.executionId ? { executionId: prior.executionId } : {}),
      ...(item.runtimeSessionBindingId
        ? { runtimeSessionBindingId: item.runtimeSessionBindingId }
        : prior?.runtimeSessionBindingId
          ? { runtimeSessionBindingId: prior.runtimeSessionBindingId }
          : {}),
      ...(item.originConversationId
        ? { conversationId: item.originConversationId }
        : prior?.conversationId
          ? { conversationId: prior.conversationId }
          : parent?.originConversationId
            ? { conversationId: parent.originConversationId }
          : undefined),
    });
    operationsByLineage.set(key, byOperation);
    hiddenIds.add(item.id);
  }

  const sessions = new Map<string, CorrelatedSession>();
  for (const [key, byOperation] of operationsByLineage) {
    // Map insertion order is the authoritative stream order of each first-seen
    // operation; do not sort by display IDs, which are opaque identities.
    const operations = [...byOperation.values()];
    const status = operations.some((operation) => operation.status === 'failed')
      ? 'failed'
      : operations.some((operation) => operation.status === 'started')
        ? 'working'
        : 'completed';
    sessions.set(key, {
      lineageKey: key,
      status,
      operations,
      ...(operations.find((operation) => operation.conversationId)?.conversationId
        ? { conversationId: operations.find((operation) => operation.conversationId)?.conversationId }
        : {}),
    });
  }

  return items.flatMap((item) => {
    if (hiddenIds.has(item.id)) return [];
    const key = lineageKeys(item).find((candidate) => sessions.has(candidate));
    const session = key ? sessions.get(key) : undefined;
    return session && parents.get(key!)?.id === item.id ? [{ ...item, session }] : [item];
  });
}
