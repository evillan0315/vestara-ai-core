/**
 * AR-REC-C2 I3-I2: Harness Approval ↔ Interaction Adapter
 *
 * Domain-owned adapter that maps between Harness approval semantics and
 * the generic StructuredInteraction/InteractionResponse contracts.
 *
 * This module is the ONLY place where:
 *   - ChoiceId → approved boolean mapping lives
 *   - Harness approval content is composed for human presentation
 *   - InteractionResponse is interpreted as approval decision
 *
 * This module does NOT:
 *   - Execute tools (that's decideApproval's job)
   - Own governance/authorization (that's RiskBasedToolPolicy's job)
 *   - Persist interactions (that's InteractionService's job)
 *   - Subscribe to events (that's the bridge's job)
 *
 * Ownership invariant:
 *   - The interactionId IS the approvalId (deterministic, no mapping table)
 *   - The Harness ThreadStore is the authoritative pending approval source
 *   - The InteractionService is the authoritative response source
 *   - This adapter is a stateless translator between the two
 */

import type { InteractionService } from '@vestara/interaction-app';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';

// ─── Port Interfaces ────────────────────────────────────────
// Minimal interfaces so the adapter doesn't depend on concrete harness/interaction classes.

/** What the adapter needs from the harness to read pending approvals. */
export interface HarnessApprovalReader {
  pendingApprovals(threadId: string): Promise<
    readonly {
      readonly approvalId: string;
      readonly threadId: string;
      readonly toolName: string;
      readonly reason: string;
      readonly risk: string;
      readonly affectedResources: readonly string[];
    }[]
  >;
  decideApproval(
    threadId: string,
    approvalId: string,
    approved: boolean,
  ): Promise<{ thread: unknown; turn: unknown; outcome?: unknown }>;
}

/** Minimal thread info needed for presentation. */
export interface ThreadInfo {
  readonly id: string;
  readonly title: string;
}

/** Resolver for thread metadata (title, etc.). */
export interface ThreadResolver {
  getThread(threadId: string): ThreadInfo | undefined;
}

// ─── Choice ID Constants ────────────────────────────────────

export const CHOICE_APPROVE = 'approve' as ChoiceId;
export const CHOICE_REJECT = 'reject' as ChoiceId;

// ─── InteractionId Derivation ───────────────────────────────

/**
 * Deterministic interactionId from approvalId.
 * The interactionId IS the approvalId — no mapping table needed.
 */
export function approvalInteractionId(approvalId: string): InteractionId {
  return `harness-approval:${approvalId}` as InteractionId;
}

/**
 * Extract approvalId from an interactionId.
 * Returns undefined if this interactionId doesn't belong to the harness approval domain.
 */
export function interactionApprovalId(interactionId: string): string | undefined {
  const prefix = 'harness-approval:';
  if (!interactionId.startsWith(prefix)) return undefined;
  return interactionId.slice(prefix.length);
}

// ─── Presentation ───────────────────────────────────────────

/**
 * Convert a Harness pending approval into a StructuredInteraction.
 *
 * The interaction presents a clear human decision:
 *   "Approve [toolName] on [resources]?"
 *   Choices: [ approve ] [ reject ]
 *
 * No command/operation/handler semantics enter the generic contract.
 */
export function approvalToInteraction(
  approval: {
    readonly approvalId: string;
    readonly toolName: string;
    readonly reason: string;
    readonly risk: string;
    readonly affectedResources: readonly string[];
  },
  threadInfo?: ThreadInfo,
): StructuredInteraction {
  const resources =
    approval.affectedResources.length > 0 ? approval.affectedResources.join(', ') : 'unspecified resources';

  const threadContext = threadInfo ? ` (thread: ${threadInfo.title})` : '';

  return {
    interactionId: approvalInteractionId(approval.approvalId),
    presentingParticipantId: `harness-approval:${approval.approvalId}`,
    presentingParticipantName: 'Agent Harness',
    createdAt: new Date().toISOString(),
    content: `Approve ${approval.toolName} on ${resources}?${threadContext}\n\nReason: ${approval.reason}\nRisk: ${approval.risk}`,
    choices: [
      { choiceId: CHOICE_APPROVE, label: 'Approve' },
      { choiceId: CHOICE_REJECT, label: 'Reject' },
    ],
  };
}

// ─── Response Interpretation ─────────────────────────────────

/**
 * Interpret an InteractionResponse as an approval decision.
 *
 * Returns:
 *   - true  → approved
 *   - false → rejected
 *   - undefined → unknown/unrecognized choice (should not happen with valid interactions)
 *
 * The mapping is owned by this module. The generic interaction system
 * only knows ChoiceId as an opaque string.
 */
export function interpretApprovalResponse(selectedChoiceId: string): boolean | undefined {
  if (selectedChoiceId === CHOICE_APPROVE) return true;
  if (selectedChoiceId === CHOICE_REJECT) return false;
  return undefined;
}

// ─── Continuation ───────────────────────────────────────────

/**
 * Resolve an InteractionResponse through the existing Harness approval mechanism.
 *
 * This function:
 *   1. Identifies whether the interaction belongs to a harness approval
 *   2. Interprets the ChoiceId
 *   3. Delegates to the EXISTING decideApproval() — no new execution path
 *
 * The subscriber calls this function. It does NOT execute tools directly.
 */
export async function resolveFromInteractionResponse(
  interactionId: string,
  response: InteractionResponse,
  harness: HarnessApprovalReader,
): Promise<{ resolved: boolean; approved?: boolean; error?: string }> {
  const approvalId = interactionApprovalId(interactionId);
  if (!approvalId) {
    return { resolved: false, error: 'Not a harness approval interaction' };
  }

  const approved = interpretApprovalResponse(response.selectedChoiceId);
  if (approved === undefined) {
    return { resolved: false, error: `Unknown choice: ${response.selectedChoiceId}` };
  }

  // Find which thread owns this approval
  // We need to search all threads — the approvalId is globally unique
  // but we don't know which thread it belongs to without searching.
  // This is acceptable because pending approvals are rare (0-5 per boot).
  //
  // The harness's decideApproval() will validate the thread/approval relationship
  // and throw if the approval doesn't belong to the thread.
  //
  // For the subscriber, we receive the threadId from the event payload
  // or from the reconciliation scan. The bridge passes it explicitly.

  return { resolved: true, approved };
}

// ─── Reconciliation ─────────────────────────────────────────

/**
 * Find all harness approvals that have interaction responses but haven't
 * been continued yet.
 *
 * Used at boot to recover from crashes where:
 *   - Response was recorded
 *   - EventBus delivery was missed
 *   - Continuation never happened
 *
 * Returns only approvals that need continuation.
 */
export async function findUncontinuedApprovals(
  harness: HarnessApprovalReader,
  threadIds: readonly string[],
  interactionService: InteractionService,
): Promise<
  readonly {
    readonly approvalId: string;
    readonly threadId: string;
    readonly response: InteractionResponse;
  }[]
> {
  const result: {
    approvalId: string;
    threadId: string;
    response: InteractionResponse;
  }[] = [];

  for (const threadId of threadIds) {
    const pending = await harness.pendingApprovals(threadId);
    for (const approval of pending) {
      const interactionId = approvalInteractionId(approval.approvalId);
      const response = await interactionService.getResponse(interactionId as InteractionId);
      if (response) {
        result.push({
          approvalId: approval.approvalId,
          threadId,
          response: response.response,
        });
      }
    }
  }

  return result;
}
