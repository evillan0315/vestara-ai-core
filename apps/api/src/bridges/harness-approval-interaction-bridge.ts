/**
 * AR-REC-C2 I3-I2-C1: Harness Approval ↔ Interaction Bridge
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
 *   - Retry reconciliation on failure with bounded exponential backoff
 *
 * Design constraints:
 *   - Lives in apps/api (needs WorkspaceContext for environment)
 *   - Does NOT execute tools (delegates to decideApproval)
 *   - Does NOT own governance (delegates to existing harness)
 *   - Does NOT modify InteractionService or Activity Room
 *   - Another producer can integrate independently
 *   - I3-I2-C1: Reconciliation failures are observable and retried
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

/** Logger interface matching Vestara console conventions. */
export interface BridgeLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface HarnessApprovalInteractionBridgeOptions {
  readonly eventBus: EventBus;
  readonly interactionService: InteractionService;
  readonly harness: HarnessApprovalReader;
  readonly threadResolver: ThreadResolver;
  readonly listThreadIds: () => string[];
  /** Optional logger for reconciliation observability. */
  readonly logger?: BridgeLogger;
  /**
   * Maximum number of retry attempts after initial reconciliation failure.
   * Default: 3. Set to 0 to disable retries (fire-and-forget only).
   */
  readonly maxReconciliationRetries?: number;
  /**
   * Base delay in ms for exponential backoff between retries.
   * Default: 1000. Actual delays: 1000, 2000, 4000, ...
   */
  readonly reconciliationBackoffMs?: number;
}

/** Disposal handle for cleanup on shutdown. */
export interface BridgeDisposal {
  /** Unsubscribe from EventBus and cancel pending retry timers. */
  dispose(): void;
}

const TAG = '[harness-approval-bridge]';

/**
 * Create the Harness Approval ↔ Interaction bridge.
 *
 * Returns a BridgeDisposal for lifecycle management.
 */
export function createHarnessApprovalInteractionBridge(
  options: HarnessApprovalInteractionBridgeOptions,
): BridgeDisposal {
  const {
    eventBus,
    interactionService,
    harness,
    threadResolver,
    listThreadIds,
    logger,
    maxReconciliationRetries = 3,
    reconciliationBackoffMs = 1000,
  } = options;

  const log = (msg: string) => (logger ?? console).log(`${TAG} ${msg}`);
  const warn = (msg: string) => (logger ?? console).warn(`${TAG} ${msg}`);
  const error = (msg: string) => (logger ?? console).error(`${TAG} ${msg}`);

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
        log(`continued approval ${approvalId} for thread ${threadId}`);
      } catch (err) {
        // decideApproval throws if:
        // - Thread already has active run (concurrent resolution)
        // - Turn is not in awaiting-approval state (already resolved)
        // - Approval request not found (data inconsistency)
        // All are expected during races/duplicates — log and ignore
        warn(`continuation failed for approval ${approvalId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return; // Found and handled — stop scanning
    }
    // Approval not found in any thread — possibly already resolved or stale
  });

  // ─── Reconciliation with Bounded Retry ──────────────────
  // I3-I2-C1: Discover pending approvals that already have responses
  // but weren't continued. Retry on failure with exponential backoff.

  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  async function attemptReconciliation(attempt: number): Promise<boolean> {
    const threadIds = listThreadIds();
    const uncontinued = await findUncontinuedApprovals(harness, threadIds, interactionService);

    if (uncontinued.length === 0) {
      return true; // Nothing to reconcile — success
    }

    let succeeded = 0;
    let failed = 0;

    for (const item of uncontinued) {
      try {
        await harness.decideApproval(item.threadId, item.approvalId, true);
        succeeded++;
      } catch (err) {
        failed++;
        warn(
          `reconciliation attempt ${attempt} failed for approval ${item.approvalId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (failed === 0) {
      log(`reconciled ${succeeded} approval(s) on attempt ${attempt}`);
      return true;
    }

    if (succeeded > 0) {
      log(`reconciled ${succeeded}/${succeeded + failed} approval(s) on attempt ${attempt}`);
    }

    return failed === 0;
  }

  async function reconcileWithRetry(): Promise<void> {
    for (let attempt = 0; attempt <= maxReconciliationRetries; attempt++) {
      if (disposed) return;

      try {
        const success = await attemptReconciliation(attempt);
        if (success) return;
      } catch (err) {
        error(`reconciliation attempt ${attempt} threw: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Schedule next retry if not the last attempt
      if (attempt < maxReconciliationRetries && !disposed) {
        const delay = reconciliationBackoffMs * 2 ** attempt;
        log(`retrying reconciliation in ${delay}ms (attempt ${attempt + 1}/${maxReconciliationRetries})`);
        await new Promise<void>((resolve) => {
          retryTimer = setTimeout(resolve, delay);
        });
      }
    }

    if (!disposed) {
      warn(`reconciliation exhausted after ${maxReconciliationRetries + 1} attempt(s)`);
    }
  }

  // Run reconciliation eagerly (fire-and-forget, like harnessSession.restoreActiveSessions)
  reconcileWithRetry().catch(() => {
    // Best-effort — errors logged internally
  });

  return {
    dispose() {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      unsubscribe();
    },
  };
}
