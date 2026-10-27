/**
 * Activity Room ↔ Orchestration deep links.
 *
 * Alignment contract (governance):
 * - Activity Room is an operational projection, never execution authority.
 * - Orchestration is the workflow execution authority.
 * - Links carry exact identities only (`projectId` / `workflowRunId`).
 *   No lineage is inferred from prose, timestamps, or proximity — the
 *   receiving surface filters by the exact id and stays fail-closed when
 *   the id is absent or unknown.
 * - Edit correlation still requires the authoritative `conversationId` +
 *   runtime `callID` pair; these links never fabricate it.
 */

/** Orchestration project id → Activity Room workflow filter URL. */
export function activityWorkflowUrl(projectId: string): string {
  return `/activity?workflow=${encodeURIComponent(projectId)}`;
}

/** Activity Room workflowRunId → Orchestration project URL (existing `?project=` entry point). */
export function orchestrationProjectUrl(workflowRunId: string): string {
  return `/orchestration?project=${encodeURIComponent(workflowRunId)}`;
}

/**
 * Parse an exact `?workflow=` param value. Fail-closed: non-strings and
 * empty strings yield null. No trimming, no case folding — byte-for-byte.
 */
export function parseWorkflowParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
