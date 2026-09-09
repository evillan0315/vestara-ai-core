/**
 * GA-RUNTIME-001 — Assistant Conversation Session Registry
 *
 * Bounded conversation → OpenCode session mapping for the Global Assistant
 * conversation runtime. Conversation identity owns Assistant runtime
 * continuity; provider/model never key the mapping.
 *
 *   conversationId
 *        ↓
 *   { sessionId, repositoryDir }
 *
 * Guarantees:
 * - Single-flight acquisition: concurrent first turns for the same
 *   conversation converge on ONE OpenCode session (never S1 + S2).
 * - Repository immutability: a binding is created for the canonical
 *   repositoryDir; presenting the same conversationId with a different
 *   authoritative repositoryDir fails safely (never silently rebinds).
 * - Preferred-session adoption: a persisted `runtimeSessionId` (e.g. after an
 *   API restart) is adopted only when it still exists in the OpenCode runtime
 *   (liveness probe); otherwise a fresh session is created.
 *
 * Lifetime (K): process-memory only. Browser reload survives because this
 * registry lives in the API process. API restart loses the in-memory mapping;
 * the persisted `runtime_session_id` column allows adoption when the OpenCode
 * runtime itself survived.
 *
 * Deliberately NOT the M7 `RuntimeSessionRegistry` (workflowRunId-keyed,
 * lifecycle state machine, maxPhysicalSessions policy). This is the smallest
 * mapping required for the Global Assistant conversation path.
 */

export interface AssistantConversationSession {
  readonly sessionId: string;
  readonly repositoryDir: string;
  readonly createdAt: string;
}

export interface AssistantSessionAcquireInput {
  readonly conversationId: string;
  /** Canonical RepositoryBinding.repositoryDir (absolute). Never UI-supplied. */
  readonly repositoryDir: string;
  /**
   * A previously persisted session id (conversation.runtime_session_id).
   * Adopted only when the runtime liveness probe confirms it still exists.
   */
  readonly preferredSessionId?: string;
  /** Create the physical OpenCode session. Called exactly once per conversation. */
  readonly createSession: () => Promise<string>;
  /** Liveness probe for a preferred session. Resolves true when the session exists. */
  readonly verifySession: (sessionId: string) => Promise<boolean>;
}

export interface AssistantSessionAcquireResult {
  readonly session: AssistantConversationSession;
  readonly created: boolean;
}

export class AssistantConversationSessionRegistry {
  private readonly byConversation = new Map<string, AssistantConversationSession>();
  /** Single-flight locks per conversationId (promise-chain lock). */
  private readonly locks = new Map<string, Promise<void>>();

  /** Current binding for a conversation, when one exists in this process. */
  get(conversationId: string): AssistantConversationSession | undefined {
    return this.byConversation.get(conversationId);
  }

  /**
   * Pre-set a binding for a conversation (e.g. after POST-route verification).
   * The first `acquire()` call for this conversationId will find the binding
   * and skip liveness verification — the session was already confirmed alive
   * by the caller.
   */
  set(conversationId: string, session: AssistantConversationSession): void {
    this.byConversation.set(conversationId, session);
  }

  count(): number {
    return this.byConversation.size;
  }

  /**
   * Acquire (create or reuse) the conversation's OpenCode session.
   * Single-flight: concurrent callers for the same conversationId serialize
   * on the first caller's acquisition.
   */
  async acquire(input: AssistantSessionAcquireInput): Promise<AssistantSessionAcquireResult> {
    const lockKey = input.conversationId;
    const existingLock = this.locks.get(lockKey);
    const resultPromise = existingLock
      ? existingLock.then(() => this.doAcquire(input))
      : this.doAcquireWithLock(lockKey, input);
    return resultPromise;
  }

  private async doAcquireWithLock(
    lockKey: string,
    input: AssistantSessionAcquireInput,
  ): Promise<AssistantSessionAcquireResult> {
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(lockKey, lockPromise);
    try {
      return await this.doAcquire(input);
    } finally {
      resolveLock();
      this.locks.delete(lockKey);
    }
  }

  private async doAcquire(input: AssistantSessionAcquireInput): Promise<AssistantSessionAcquireResult> {
    // Reuse: an existing binding owns the conversation's continuity.
    const existing = this.byConversation.get(input.conversationId);
    if (existing) {
      if (existing.repositoryDir !== input.repositoryDir) {
        throw new Error(
          `GA-RUNTIME-001: conversation ${input.conversationId} is bound to repository ` +
            `${existing.repositoryDir}, but the turn presented ${input.repositoryDir}. ` +
            `Repository directory is immutable for the mapping — refusing to rebind.`,
        );
      }
      return { session: existing, created: false };
    }

    // Adoption: a persisted session id survives an API restart. Adopt it only
    // when the OpenCode runtime still owns it (browser reload / API restart
    // must NOT create another session while the server-side session exists).
    if (input.preferredSessionId) {
      console.log(
        `[registry:acquire] attempting adoption conv=${input.conversationId} preferred=${input.preferredSessionId}`,
      );
      const alive = await input.verifySession(input.preferredSessionId).catch(() => false);
      console.log(`[registry:acquire] verification result: alive=${alive}`);
      if (alive) {
        const adopted: AssistantConversationSession = {
          sessionId: input.preferredSessionId,
          repositoryDir: input.repositoryDir,
          createdAt: new Date().toISOString(),
        };
        this.byConversation.set(input.conversationId, adopted);
        return { session: adopted, created: false };
      }
    }

    // Create: first turn for this conversation.
    const sessionId = await input.createSession();
    const created: AssistantConversationSession = {
      sessionId,
      repositoryDir: input.repositoryDir,
      createdAt: new Date().toISOString(),
    };
    this.byConversation.set(input.conversationId, created);
    return { session: created, created: true };
  }
}
