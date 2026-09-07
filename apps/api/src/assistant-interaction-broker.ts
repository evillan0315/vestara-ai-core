/**
 * GA-RUNTIME-001 Addendum B — Assistant Interaction Broker
 *
 * Bridges the turn-time OpenCode permission/question request (raised inside the
 * adapter's SSE-driven turn) with the browser's interactive decision (arriving
 * over a separate HTTP request). ASK is a real interactive feature, not a
 * failure path.
 *
 *   adapter (turn loop)
 *       │ awaitDecision(conversationId, requestId, timeoutMs)
 *       ▼
 *   AssistantInteractionBroker
 *       ▲ decide(conversationId, requestId, decision)   ← POST /permissions/:id
 *       │
 *   browser (Floating Assistant)
 *
 * Permissions use OpenCode's native response semantics (approve once / approve
 * for session / reject). Questions are answered with option labels (or
 * rejected). A request with no timely user decision times out and is rejected
 * fail-safe by the adapter.
 */

import type { VestaraPermissionDecision } from '@vestara/opencode-runtime';

export type AssistantPermissionDecision = VestaraPermissionDecision;

export interface AssistantQuestionDecision {
  readonly answers: readonly (readonly string[])[];
}

interface PendingInteraction {
  readonly kind: 'permission' | 'question';
  readonly resolve: (decision: unknown) => void;
  readonly at: number;
}

const PERMISSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes, matches a long user think

function key(conversationId: string, requestId: string): string {
  return `${conversationId}:${requestId}`;
}

export class AssistantInteractionBroker {
  private readonly pending = new Map<string, PendingInteraction>();

  /**
   * Wait for the user's decision on a pending permission request.
   * Resolves the decision, or `undefined` when the wait times out.
   */
  async awaitPermission(
    conversationId: string,
    permissionId: string,
    timeoutMs: number = PERMISSION_TIMEOUT_MS,
  ): Promise<AssistantPermissionDecision | undefined> {
    return this.awaitDecision('permission', conversationId, permissionId, timeoutMs) as Promise<
      AssistantPermissionDecision | undefined
    >;
  }

  /**
   * Wait for the user's answer to a pending question request.
   * Resolves the answers, or `undefined` when the wait times out.
   */
  async awaitQuestion(
    conversationId: string,
    questionRequestId: string,
    timeoutMs: number = PERMISSION_TIMEOUT_MS,
  ): Promise<AssistantQuestionDecision | undefined> {
    return this.awaitDecision('question', conversationId, questionRequestId, timeoutMs) as Promise<
      AssistantQuestionDecision | undefined
    >;
  }

  /** Resolve a pending permission decision (from the browser). */
  decidePermission(conversationId: string, permissionId: string, decision: AssistantPermissionDecision): boolean {
    return this.decide('permission', conversationId, permissionId, decision);
  }

  /** Resolve a pending question answer (from the browser). */
  decideQuestion(conversationId: string, questionRequestId: string, decision: AssistantQuestionDecision): boolean {
    return this.decide('question', conversationId, questionRequestId, decision);
  }

  /** Bounded diagnostic: number of still-pending interactions. */
  get pendingCount(): number {
    return this.pending.size;
  }

  private async awaitDecision(
    kind: 'permission' | 'question',
    conversationId: string,
    requestId: string,
    timeoutMs: number,
  ): Promise<unknown> {
    const keyName = key(conversationId, requestId);
    if (this.pending.has(keyName)) {
      // Duplicate request id — a decision is already being awaited.
      return undefined;
    }
    return new Promise<unknown>((resolve) => {
      const entry = {
        kind,
        resolve,
        at: Date.now(),
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      };
      this.pending.set(keyName, entry);
      entry.timer = setTimeout(() => {
        if (this.pending.delete(keyName)) resolve(undefined);
      }, timeoutMs);
    });
  }

  private decide(
    kind: 'permission' | 'question',
    conversationId: string,
    requestId: string,
    decision: unknown,
  ): boolean {
    const entry = this.pending.get(key(conversationId, requestId));
    if (!entry || entry.kind !== kind) return false;
    this.pending.delete(key(conversationId, requestId));
    const record = entry as PendingInteraction & { timer?: ReturnType<typeof setTimeout> };
    if (record.timer) clearTimeout(record.timer);
    entry.resolve(decision);
    return true;
  }
}
