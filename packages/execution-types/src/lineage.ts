/**
 * Execution lineage — parent/child execution relationships.
 *
 * Supports:
 *   - agent/subagent inspection
 *   - execution timeline
 *   - Task/Todo projection
 *   - Activity Room projection
 *   - Global Assistant execution navigation
 *
 * Lineage is expressed via parentExecutionId on ExecutionRequest.
 * This module provides the tree query utilities.
 */

import type { ExecutionId } from './identity.js';

/**
 * A node in the execution tree.
 */
export interface ExecutionLineageNode {
  readonly executionId: ExecutionId;
  readonly parentExecutionId?: ExecutionId;
  readonly depth: number;
}

/**
 * Compute the depth of an execution in its lineage tree.
 * Root executions (no parent) have depth 0.
 */
export function executionDepth(
  node: ExecutionLineageNode,
  lookup: (id: ExecutionId) => ExecutionLineageNode | undefined,
): number {
  let depth = 0;
  let current = node;
  while (current.parentExecutionId) {
    const parent = lookup(current.parentExecutionId);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
}

/**
 * Collect all ancestor execution IDs from a node to the root.
 * Returns ordered list from node to root (excluding the node itself).
 */
export function ancestorIds(
  node: ExecutionLineageNode,
  lookup: (id: ExecutionId) => ExecutionLineageNode | undefined,
): ExecutionId[] {
  const ancestors: ExecutionId[] = [];
  let current = node;
  while (current.parentExecutionId) {
    ancestors.push(current.parentExecutionId);
    const parent = lookup(current.parentExecutionId);
    if (!parent) break;
    current = parent;
  }
  return ancestors;
}

/**
 * Check whether one execution is an ancestor of another.
 */
export function isAncestor(
  ancestorId: ExecutionId,
  descendantId: ExecutionId,
  lookup: (id: ExecutionId) => ExecutionLineageNode | undefined,
): boolean {
  const descendant = lookup(descendantId);
  if (!descendant) return false;
  const ancestors = ancestorIds(descendant, lookup);
  return ancestors.some((id) => id === ancestorId);
}
