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

/**
 * One audit entry for a permission/question lifecycle event. This is the
 * unified assistant-side audit: interactive ASK decisions (browser), auto
 * ALLOW/DENY policy resolutions (adapter), timeouts, and cancellations all
 * land here with the same shape. The Console bridge (`routes/opencode.ts`)
 * keeps its own `logAudit` + `AuditAction` entries; both surfaces record
 * `{conversation|session, request, decision, scope, reason, latencyMs}` so a
 * reviewer can join them on request id.
 */
export interface AssistantPermissionAuditEntry {
  readonly at: string;
  readonly kind: 'permission' | 'question';
  readonly conversationId: string;
  readonly requestId: string;
  readonly event: 'requested' | 'decided' | 'expired' | 'cancelled' | 'auto-allow' | 'auto-deny';
  readonly decision?: string;
  readonly scope?: string;
  readonly reason?: string;
  readonly latencyMs?: number;
}

const MAX_AUDIT_ENTRIES = 200;

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
  private readonly audit: AssistantPermissionAuditEntry[] = [];

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

  /**
   * Release a pending question wait without answers (VES-TG-030: Telegram
   * Reject). The adapter treats the undefined decision as a fail-safe
   * reject — identical to the timeout path, but immediate.
   */
  cancelQuestion(conversationId: string, questionRequestId: string): boolean {
    const entry = this.pending.get(key(conversationId, questionRequestId));
    if (entry?.kind !== 'question') return false;
    this.pending.delete(key(conversationId, questionRequestId));
    const record = entry as PendingInteraction & { timer?: ReturnType<typeof setTimeout> };
    if (record.timer) clearTimeout(record.timer);
    this.pushAudit({
      at: new Date().toISOString(),
      kind: 'question',
      conversationId,
      requestId: questionRequestId,
      event: 'cancelled',
      latencyMs: Date.now() - entry.at,
    });
    entry.resolve(undefined);
    return true;
  }

  /** Bounded diagnostic: number of still-pending interactions. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Unified audit trail (newest last, bounded). Every lifecycle event —
   * requested, decided, expired, cancelled, auto-allow, auto-deny — is
   * recorded here regardless of which path resolved it, so reviewers have
   * one place to verify what authority actually executed.
   */
  getAuditTrail(): readonly AssistantPermissionAuditEntry[] {
    return this.audit;
  }

  /**
   * Record an automatic policy resolution (ALLOW/DENY) that never waited
   * on the user. Called by the adapter alongside the OpenCode response so
   * auto-decisions are auditable exactly like interactive ones.
   */
  recordPolicyDecision(entry: {
    kind?: 'permission' | 'question';
    conversationId: string;
    requestId: string;
    decision: 'auto-allow' | 'auto-deny';
    reason?: string;
  }): void {
    this.pushAudit({
      at: new Date().toISOString(),
      kind: entry.kind ?? 'permission',
      conversationId: entry.conversationId,
      requestId: entry.requestId,
      event: entry.decision,
      decision: entry.decision,
      ...(entry.reason ? { reason: entry.reason.slice(0, 500) } : {}),
    });
  }

  private pushAudit(entry: AssistantPermissionAuditEntry): void {
    this.audit.push(entry);
    while (this.audit.length > MAX_AUDIT_ENTRIES) this.audit.shift();
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
      this.pushAudit({
        at: new Date().toISOString(),
        kind,
        conversationId,
        requestId,
        event: 'requested',
      });
      entry.timer = setTimeout(() => {
        if (this.pending.delete(keyName)) {
          this.pushAudit({
            at: new Date().toISOString(),
            kind,
            conversationId,
            requestId,
            event: 'expired',
            reason: 'no user decision within timeout — fail-safe reject',
            latencyMs: Date.now() - entry.at,
          });
          resolve(undefined);
        }
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
    const d = decision as { decision?: string; scope?: string; reason?: string; answers?: unknown };
    this.pushAudit({
      at: new Date().toISOString(),
      kind,
      conversationId,
      requestId,
      event: 'decided',
      ...(typeof d?.decision === 'string' ? { decision: d.decision } : {}),
      ...(typeof d?.scope === 'string' ? { scope: d.scope } : {}),
      ...(typeof d?.reason === 'string' ? { reason: d.reason.slice(0, 500) } : {}),
      ...(d && 'answers' in d ? { decision: 'answered' } : {}),
      latencyMs: Date.now() - entry.at,
    });
    entry.resolve(decision);
    return true;
  }
}
