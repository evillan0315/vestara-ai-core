/**
 * AR-REC-C2 I3-I2: Harness Approval ↔ Interaction Bridge
 *
 * Wires the Harness approval flow to the generic Interaction system.
 * This is the composition root for the first real producer.
 *
 * Responsibilities:
 *   - Subscribe to interaction:responded events
 *   - Filter to harness approval interactions
 *   - Delegate to existing decideApproval() for continuation
 *   - Present pending approvals as StructuredInteractions
 *   - Reconcile at boot (find responses for pending approvals)
 *
 * Design constraints:
 *   - Lives in apps/api (needs WorkspaceContext for environment)
 *   - Does NOT execute tools (delegates to decideApproval)
 *   - Does NOT own governance (delegates to existing harness)
 *   - Does NOT modify InteractionService or Activity Room
 *   - Another producer can integrate independently
 */

import {
  approvalInteractionId,
  approvalToInteraction,
  findUncontinuedApprovals,
  type HarnessApprovalReader,
  interactionApprovalId,
  resolveFromInteractionResponse,
  type ThreadInfo,
  type ThreadResolver,
} from '@vestara/agent-harness';
import type { EventBus } from '@vestara/event-bus';
import type { InteractionService } from '@vestara/interaction-app';
import type { VestaraEvent } from '@vestara/shared';
import type { InteractionId, InteractionResponse } from '@vestara/types';

export interface HarnessApprovalInteractionBridgeOptions {
  readonly eventBus: EventBus;
  readonly interactionService: InteractionService;
  readonly harness: HarnessApprovalReader;
  readonly threadResolver: ThreadResolver;
  readonly listThreadIds: () => string[];
}

/**
 * Create the Harness Approval ↔ Interaction bridge.
 *
 * Returns an unsubscribe function for lifecycle management.
 */
export function createHarnessApprovalInteractionBridge(options: HarnessApprovalInteractionBridgeOptions): () => void {
  const { eventBus, interactionService, harness, threadResolver, listThreadIds } = options;

  // ─── Event Subscriber ───────────────────────────────────
  // Subscribe to interaction:responded and filter to harness approval interactions.

  const unsubscribe = eventBus.subscribe('interaction:responded', async (event: VestaraEvent) => {
    const payload = event.payload as {
      interactionId?: string;
      selectedChoiceId?: string;
      responseId?: string;
    };

    const interactionId = payload.interactionId;
    if (!interactionId) return;

    // Filter: only harness approval interactions
    const approvalId = interactionApprovalId(interactionId);
    if (!approvalId) return;

    // Load the authoritative InteractionResponse
    const persisted = await interactionService.getResponse(interactionId as InteractionId);
    if (!persisted) return;

    // Interpret ChoiceId through harness-owned semantics
    const resolution = await resolveFromInteractionResponse(interactionId, persisted.response, harness);

    if (!resolution.resolved) {
      // Unknown choice or not our interaction — log and ignore
      return;
    }

    // Find which thread owns this approval by scanning pending approvals
    const threadIds = listThreadIds();
    for (const threadId of threadIds) {
      const pending = await harness.pendingApprovals(threadId);
      const matching = pending.find((p) => p.approvalId === approvalId);
      if (!matching) continue;

      // Found the owning thread — delegate to existing decideApproval()
      try {
        await harness.decideApproval(threadId, approvalId, resolution.approved!);
      } catch {
        // decideApproval throws if:
        // - Thread already has active run (concurrent resolution)
        // - Turn is not in awaiting-approval state (already resolved)
        // - Approval request not found (data inconsistency)
        // All are expected during races/duplicates — log and ignore
      }
      return; // Found and handled — stop scanning
    }
    // Approval not found in any thread — possibly already resolved or stale
  });

  // ─── Boot Reconciliation ────────────────────────────────
  // At startup, discover pending approvals that already have responses
  // but weren't continued (crash between response recording and continuation).

  async function reconcile(): Promise<void> {
    const threadIds = listThreadIds();
    const uncontinued = await findUncontinuedApprovals(harness, threadIds, interactionService);

    for (const item of uncontinued) {
      // Delegate to the same continuation path as the fast path
      try {
        await harness.decideApproval(item.threadId, item.approvalId, true);
      } catch {
        // Same error handling as fast path — concurrent resolution, already resolved, etc.
      }
    }
  }

  // Run reconciliation eagerly (fire-and-forget, like harnessSession.restoreActiveSessions)
  reconcile().catch(() => {
    // Best-effort — logged internally
  });

  return unsubscribe;
}
