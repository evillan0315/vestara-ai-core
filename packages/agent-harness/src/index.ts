import type { EventBus } from '@vestara/event-bus';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@vestara/shared';
import type { AppendThreadItemInput, ThreadReplay, ThreadStore } from '@vestara/thread-runtime';
import type { ToolCallRequest, ToolRuntime } from '@vestara/tool-runtime';
import type {
  AgentEnvironment,
  AgentRunOutcome,
  AgentRunState,
  AgentTurn,
  AgentTurnId,
  ApprovalRequestId,
  ApprovalRequestPayload,
  CorrelationId,
  HarnessVerificationResult,
  TaskThread,
  TaskThreadId,
  ThreadItem,
  ToolCallId,
  ToolResultPayload,
  ToolRisk,
} from '@vestara/types';

export type { EventBus } from '@vestara/event-bus';

export interface HarnessContextAssembler {
  assemble(input: {
    readonly thread: TaskThread;
    readonly turn: AgentTurn;
    readonly replay: ThreadReplay;
    readonly environment: AgentEnvironment;
  }): Promise<string>;
}

export interface HarnessVerifier {
  verify(input: {
    readonly thread: TaskThread;
    readonly turn: AgentTurn;
    readonly replay: ThreadReplay;
    readonly environment: AgentEnvironment;
  }): Promise<HarnessVerificationResult>;
}

export interface AgentHarnessOptions {
  readonly store: ThreadStore;
  readonly provider: AIProvider;
  readonly model: string;
  readonly tools: ToolRuntime;
  readonly context: HarnessContextAssembler;
  readonly verifier: HarnessVerifier;
  readonly eventBus?: EventBus;
  readonly maxIterations?: number;
  /** Items kept raw in the provider context; earlier items are compacted. */
  readonly maxContextItems?: number;
  /** Maximum number of verification-driven revision loops (default: 2). */
  readonly maxRevisions?: number;
  /** Enable interruptive steering — steer messages abort active tool execution (default: true).
   *  Note: steering during inference is always processed in the next iteration. */
  readonly interruptiveSteering?: boolean;
}

export interface StartThreadInput {
  readonly taskId: string;
  readonly title: string;
  readonly environment: AgentEnvironment;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RunTurnInput {
  readonly threadId: TaskThreadId;
  readonly instruction: string;
  readonly agentId: string;
  readonly environment: AgentEnvironment;
}

export interface HarnessRunResult {
  readonly thread: TaskThread;
  readonly turn: AgentTurn;
  readonly outcome?: AgentRunOutcome;
  readonly approvalId?: ApprovalRequestId;
}

/**
 * Identity carried by every `harness.*` domain event so the event-store
 * bridge, engineering graph, Execution Center, TUI, and replay system can all
 * describe the same execution coherently.
 */
export interface HarnessEventIdentity {
  readonly threadId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

/** A tool call preserved in an approval request so the queue survives restart. */
export interface PendingToolCall {
  readonly callId: ToolCallId;
  readonly toolName: string;
  readonly arguments: string;
}

export interface PendingApproval {
  readonly approvalId: ApprovalRequestId;
  readonly threadId: TaskThreadId;
  readonly turnId: AgentTurnId;
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly requestedAt: string;
  readonly risk: ToolRisk;
  readonly reason: string;
  readonly affectedResources: readonly string[];
}

export interface RunSnapshot {
  readonly runId: string;
  readonly turnId: AgentTurnId | undefined;
  readonly state: AgentRunState;
}

/** Selector for how the workspace executes agent turns. */
export type AgentExecutionEngine = 'legacy-orchestrator' | 'harness';

interface ActiveRun {
  readonly controller: AbortController;
  readonly environment: AgentEnvironment;
  readonly agentId: string;
}

type ModelToolCall = { id: string; name: string; arguments: string };

type CallQueueOutcome = { approvalId: ApprovalRequestId } | { done: true };

let harnessCounter = 0;

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${++harnessCounter}`;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: Readonly<Record<string, unknown>>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new Error(`Missing string field: ${key}`);
  return field;
}

function parseToolInput(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error('Provider returned invalid tool arguments');
  }
}

function terminalOutcome(state: AgentRunState): boolean {
  return state === 'completed' || state === 'failed' || state === 'blocked' || state === 'cancelled';
}

export interface CompactedContext {
  readonly summary?: string;
  readonly recent: readonly ThreadItem[];
}

/**
 * Compact a long thread for the provider context while preserving the
 * non-negotiable execution facts required for safe restart and idempotent
 * execution: the instruction, user steering, completed tool-call IDs, changed
 * files, failed attempts, verification state, and approval decisions. Earlier
 * items are summarized; the most recent `windowSize` items stay raw.
 */
export function compactContext(items: readonly ThreadItem[], windowSize: number): CompactedContext {
  if (items.length <= windowSize) return { recent: items };
  const recent = items.slice(-windowSize);
  const earlier = items.slice(0, items.length - windowSize);
  const lines: string[] = [];

  const instruction = earlier.find((item) => item.kind === 'user-message');
  if (instruction) lines.push(`Instruction: ${String(record(instruction.payload).content ?? '')}`);
  const steering = earlier
    .filter((item) => item.kind === 'steering-message')
    .map((item) => String(record(item.payload).content ?? ''));
  if (steering.length) lines.push(`User steering: ${steering.join(' | ')}`);

  const toolCalls = earlier
    .filter((item) => item.kind === 'tool-call')
    .map((item) => `${String(record(item.payload).toolName ?? 'tool')}(${String(record(item.payload).callId ?? '')})`);
  if (toolCalls.length) lines.push(`Completed tool calls: ${toolCalls.join(', ')}`);

  const changed = new Set<string>();
  for (const item of earlier) {
    const payload = record(item.payload);
    if (item.kind === 'tool-call') {
      const input = payload.input as { path?: unknown } | undefined;
      if (input && typeof input.path === 'string' && String(payload.toolName ?? '').startsWith('filesystem.'))
        changed.add(input.path);
    }
    if (item.kind === 'tool-result' && Array.isArray(payload.evidence)) {
      for (const artifact of payload.evidence as ReadonlyArray<{ metadata?: Readonly<Record<string, unknown>> }>) {
        if (artifact.metadata && typeof artifact.metadata.path === 'string')
          changed.add(artifact.metadata.path as string);
      }
    }
  }
  if (changed.size) lines.push(`Changed files: ${[...changed].join(', ')}`);

  const failed = earlier
    .filter((item) => item.kind === 'tool-result' && record(item.payload).status === 'failed')
    .map(
      (item) => `${String(record(item.payload).toolName ?? 'tool')}: ${String(record(item.payload).error ?? 'failed')}`,
    );
  if (failed.length) lines.push(`Failed attempts: ${failed.join(' | ')}`);

  const verifications = earlier
    .filter((item) => item.kind === 'verification-result')
    .map((item) => {
      const payload = record(item.payload);
      return `${String(payload.status ?? 'inconclusive')}${typeof payload.confidence === 'number' ? ` (${Math.round(payload.confidence * 100)}%)` : ''}`;
    });
  if (verifications.length) lines.push(`Verification: ${verifications.join(' | ')}`);

  const approvals = earlier
    .filter((item) => item.kind === 'approval-request' || item.kind === 'approval-decision')
    .map((item) => {
      const payload = record(item.payload);
      return item.kind === 'approval-request'
        ? `${String(payload.toolName ?? 'tool')}: requested`
        : `${String(payload.toolName ?? 'tool')}: ${String(payload.decision ?? 'resolved')}`;
    });
  if (approvals.length) lines.push(`Approvals: ${approvals.join(' | ')}`);

  return {
    summary: `[Compacted context — earlier turns summarized; do not redo completed work]\n${lines.join('\n')}`,
    recent,
  };
}

export class AgentHarnessRuntime {
  private readonly active = new Map<TaskThreadId, ActiveRun>();
  private readonly environments = new Map<string, AgentEnvironment>();
  private readonly maxIterations: number;
  private readonly maxContextItems: number;
  private readonly maxRevisions: number;
  private readonly interruptiveSteering: boolean;

  constructor(private readonly options: AgentHarnessOptions) {
    this.maxIterations = options.maxIterations ?? 12;
    this.maxContextItems = options.maxContextItems ?? 40;
    this.maxRevisions = options.maxRevisions ?? 2;
    this.interruptiveSteering = options.interruptiveSteering ?? true;
  }

  get eventBus(): EventBus | undefined {
    return this.options.eventBus;
  }

  createThread(input: StartThreadInput): TaskThread {
    this.environments.set(input.environment.id, input.environment);
    const thread = this.options.store.createThread({
      taskId: input.taskId,
      title: input.title,
      environmentId: input.environment.id,
      metadata: input.metadata,
    });
    void this.emit(
      'harness.thread.created',
      {
        threadId: thread.id,
        turnId: '',
        runId: '',
        agentId: '',
        correlationId: id('correlation'),
      },
      { taskId: input.taskId, title: input.title },
    );
    return thread;
  }

  async run(input: RunTurnInput): Promise<HarnessRunResult> {
    const thread = this.requireThread(input.threadId);
    if (thread.environmentId !== input.environment.id) throw new Error('Environment does not match thread lease');
    if (this.active.has(input.threadId)) throw new Error(`Thread already has an active run: ${input.threadId}`);
    this.environments.set(input.environment.id, input.environment);
    const turn = this.options.store.createTurn({ threadId: input.threadId, input: input.instruction });
    const correlationId = id('correlation') as CorrelationId;
    const runId = id('run');
    const runItem = this.append(turn, 'harness-run', 'agent-harness', { runId, agentId: input.agentId }, correlationId);
    this.append(turn, 'user-message', 'user', { content: input.instruction }, correlationId, runItem.id);
    const active: ActiveRun = {
      controller: new AbortController(),
      environment: input.environment,
      agentId: input.agentId,
    };
    this.active.set(input.threadId, active);
    await this.emit('harness.turn.started', this.identity(thread.id, turn.id, correlationId), {
      runId,
      instruction: input.instruction,
    });
    try {
      return await this.continueTurn(turn.id, active, correlationId);
    } finally {
      this.active.delete(input.threadId);
    }
  }

  /**
   * Durable discovery of unresolved approvals, read from thread items — never
   * from in-memory harness state — so it works after a restart.
   */
  async pendingApprovals(threadId: string): Promise<readonly PendingApproval[]> {
    const items = this.options.store.listItems(threadId as TaskThreadId);
    const decided = new Set(
      items
        .filter((item) => item.kind === 'approval-decision')
        .map((item) => String(record(item.payload).approvalId ?? '')),
    );
    const out: PendingApproval[] = [];
    for (const item of items) {
      if (item.kind !== 'approval-request') continue;
      const payload = record(item.payload);
      const approvalId = String(payload.approvalId ?? '');
      if (!approvalId || decided.has(approvalId)) continue;
      out.push({
        approvalId: approvalId as ApprovalRequestId,
        threadId: item.threadId,
        turnId: item.turnId,
        toolCallId: String(payload.callId ?? '') as ToolCallId,
        toolName: String(payload.toolName ?? ''),
        requestedAt: item.createdAt,
        risk: (payload.risk as ToolRisk) ?? 'low',
        reason: String(payload.reason ?? ''),
        affectedResources: Array.isArray(payload.affectedResources) ? (payload.affectedResources as string[]) : [],
      });
    }
    return out;
  }

  async decideApproval(
    threadId: TaskThreadId,
    approvalId: ApprovalRequestId,
    approved: boolean,
    environment?: AgentEnvironment,
  ): Promise<HarnessRunResult> {
    if (this.active.has(threadId)) throw new Error(`Thread already has an active run: ${threadId}`);
    const thread = this.requireThread(threadId);
    const allItems = this.options.store.listItems(threadId);
    // Idempotent: a persisted decision must never re-execute the tool, even if
    // this request is replayed after the turn has already resumed or finished.
    const existingDecision = allItems.find(
      (item) => item.kind === 'approval-decision' && record(item.payload).approvalId === approvalId,
    );
    if (existingDecision) {
      const turn = this.options.store.getTurn(existingDecision.turnId);
      if (!turn) throw new Error(`Turn not found: ${existingDecision.turnId}`);
      return { thread, turn, outcome: turn.outcome };
    }
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    if (turn.state !== 'awaiting-approval') throw new Error('Thread is not awaiting approval');
    const items = this.options.store.listItems(threadId, turn.id);
    const approval = items.find(
      (item) => item.kind === 'approval-request' && record(item.payload).approvalId === approvalId,
    );
    if (!approval) throw new Error(`Approval request not found: ${approvalId}`);
    const approvalPayload = record(approval.payload);
    const callId = stringField(approvalPayload, 'callId') as ToolCallId;
    const toolCall = items.find((item) => item.kind === 'tool-call' && record(item.payload).callId === callId);
    if (!toolCall) throw new Error(`Tool call not found for approval: ${approvalId}`);
    const correlationId = approval.correlationId;
    const identity = this.identity(threadId, turn.id, correlationId);
    const decisionItem = this.append(
      turn,
      'approval-decision',
      'user',
      { approvalId, callId, decision: approved ? 'approved' : 'rejected' },
      correlationId,
      approval.id,
    );
    await this.emit('harness.approval.resolved', identity, {
      approvalId,
      callId,
      approved,
      decision: approved ? 'approved' : 'rejected',
    });
    if (!approved) return this.finish(turn, 'blocked', 'Approval was rejected', 'approval-rejected', correlationId);

    const resolvedEnvironment = environment ?? this.environments.get(thread.environmentId);
    if (!resolvedEnvironment)
      throw new Error(`Environment must be reattached to resume thread: ${thread.environmentId}`);
    if (resolvedEnvironment.id !== thread.environmentId) throw new Error('Environment does not match thread lease');
    this.environments.set(resolvedEnvironment.id, resolvedEnvironment);
    const active: ActiveRun = {
      controller: new AbortController(),
      environment: resolvedEnvironment,
      agentId: identity.agentId || String(record(toolCall.payload).agentId ?? 'agent'),
    };
    this.active.set(threadId, active);
    try {
      const invocation = this.toolRequestFromItem(thread, toolCall, active);
      const result = await this.options.tools.invoke(invocation, active.controller.signal, true);
      await this.recordToolResult(turn, invocation, result, correlationId, toolCall.id);
      if (result.status === 'cancelled')
        return this.finish(turn, 'cancelled', 'Tool cancelled after approval', 'tool-cancelled', correlationId);
      const pendingCalls = (approvalPayload.pendingCalls as readonly PendingToolCall[] | undefined) ?? [];
      const remaining: ModelToolCall[] = pendingCalls.map((pending) => ({
        id: pending.callId,
        name: pending.toolName,
        arguments: pending.arguments,
      }));
      const outcome = await this.executeToolCalls(turn.id, active, correlationId, remaining, decisionItem.id);
      if ('approvalId' in outcome)
        return {
          thread: this.requireThread(threadId),
          turn: this.requireTurn(turn.id),
          approvalId: outcome.approvalId,
        };
      const resumed = this.requireTurn(turn.id);
      if (resumed.outcome) return { thread: this.requireThread(threadId), turn: resumed, outcome: resumed.outcome };
      return await this.continueTurn(turn.id, active, correlationId);
    } finally {
      this.active.delete(threadId);
    }
  }

  /** Re-attach an environment and continue an interrupted non-terminal turn after a restart. */
  async resume(threadId: TaskThreadId, environment?: AgentEnvironment): Promise<HarnessRunResult> {
    const thread = this.requireThread(threadId);
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    if (turn.outcome) throw new Error('Turn is already terminal');
    if (turn.state === 'awaiting-approval') throw new Error('Resolve the pending approval before resuming this thread');
    const resolvedEnvironment = environment ?? this.environments.get(thread.environmentId);
    if (!resolvedEnvironment)
      throw new Error(`Environment must be reattached to resume thread: ${thread.environmentId}`);
    if (resolvedEnvironment.id !== thread.environmentId) throw new Error('Environment does not match thread lease');
    this.environments.set(resolvedEnvironment.id, resolvedEnvironment);
    const identity = this.identity(threadId, turn.id, this.correlationForTurn(threadId, turn.id));
    const active: ActiveRun = {
      controller: new AbortController(),
      environment: resolvedEnvironment,
      agentId: identity.agentId || 'agent',
    };
    if (this.active.has(threadId)) throw new Error(`Thread already has an active run: ${threadId}`);
    this.active.set(threadId, active);
    try {
      return await this.continueTurn(turn.id, active, this.correlationForTurn(threadId, turn.id));
    } finally {
      this.active.delete(threadId);
    }
  }

  steer(threadId: TaskThreadId, message: string, actorId = 'user'): ThreadItem {
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    const correlationId = this.correlationForTurn(threadId, turn.id);
    const item = this.append(turn, 'steering-message', actorId, { content: message }, correlationId);
    void this.emit('harness.steer', this.identity(threadId, turn.id, correlationId), { itemId: item.id, message });
    // Interruptive steering: abort active tool execution (not inference)
    // Inference always processes steering in the next iteration via the existing check
    if (this.interruptiveSteering) {
      const active = this.active.get(threadId);
      if (active) {
        // Check if we're in tool execution state (not inference)
        const currentState = turn.state;
        if (currentState === 'executing-tool' || currentState === 'awaiting-tool') {
          active.controller.abort('steering-message');
          // Recreate controller for the next iteration
          this.active.set(threadId, { ...active, controller: new AbortController() });
        }
      }
    }
    return item;
  }

  /**
   * Explicit workflow stage announcement. The workflow projection infers
   * stages from thread items by default; an agent or orchestrator with richer
   * information can announce a stage to override that inference.
   */
  async announceStage(
    threadId: TaskThreadId,
    stageId: string,
    phase: 'started' | 'updated' | 'completed',
    detail?: string,
  ): Promise<void> {
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    const correlationId = this.correlationForTurn(threadId, turn.id);
    const identity = this.identity(threadId, turn.id, correlationId);
    await this.emit(`harness.stage.${phase}`, identity, { stageId, detail, phase });
  }

  cancel(threadId: TaskThreadId, reason = 'Cancelled by user'): AgentTurn {
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    this.active.get(threadId)?.controller.abort(reason);
    const correlationId = this.correlationForTurn(threadId, turn.id);
    const identity = this.identity(threadId, turn.id, correlationId);
    void this.emit('harness.turn.cancelled', identity, { reason });
    return this.finish(turn, 'cancelled', reason, 'cancelled-by-user', correlationId).turn;
  }

  replay(threadId: TaskThreadId): ThreadReplay {
    return this.options.store.replay(threadId);
  }

  listThreads(): readonly TaskThread[] {
    return this.options.store.listThreads();
  }

  /** Fast, durable identifiers for the POST /runs response — read from thread items, not memory. */
  snapshot(threadId: TaskThreadId): RunSnapshot {
    const thread = this.requireThread(threadId);
    const run = this.runIdentity(thread.id);
    const turn = this.options.store.getActiveTurn(thread.id);
    return { runId: run?.runId ?? '', turnId: turn?.id, state: turn?.state ?? 'queued' };
  }

  private async continueTurn(
    turnId: AgentTurnId,
    active: ActiveRun,
    correlationId: CorrelationId,
  ): Promise<HarnessRunResult> {
    let turn = this.requireTurn(turnId);
    const thread = this.requireThread(turn.threadId);
    await this.transition(turn, 'preparing', correlationId);
    const context = await this.options.context.assemble({
      thread,
      turn,
      replay: this.options.store.replay(thread.id),
      environment: active.environment,
    });

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      turn = this.requireTurn(turnId);
      if (turn.outcome) return { thread: this.requireThread(turn.threadId), turn, outcome: turn.outcome };
      if (active.controller.signal.aborted) {
        return this.finish(turn, 'cancelled', 'Run cancelled', 'cancelled', correlationId);
      }
      await this.transition(turn, 'reasoning', correlationId);
      const beforeInferenceSequence = this.options.store.listItems(thread.id).at(-1)?.sequence ?? 0;
      await this.emit('harness.model.started', this.identity(thread.id, turn.id, correlationId), { iteration });
      let response: CompletionResponse;
      try {
        response = await this.options.provider.complete({
          model: this.options.model,
          messages: this.messages(thread.id, context),
          tools: [...this.options.tools.definitions()],
        } satisfies CompletionRequest);
      } catch (error) {
        return this.finish(
          turn,
          'failed',
          error instanceof Error ? error.message : String(error),
          'provider-failed',
          correlationId,
        );
      }
      if (active.controller.signal.aborted)
        return this.finish(turn, 'cancelled', 'Run cancelled', 'cancelled', correlationId);
      const modelItem = this.append(
        turn,
        'model-response',
        this.options.provider.id,
        { content: response.content, model: response.model, provider: response.provider, usage: response.usage },
        correlationId,
      );
      await this.emit('harness.model.completed', this.identity(thread.id, turn.id, correlationId), {
        toolCallCount: response.toolCalls?.length ?? 0,
        content: response.content,
      });
      const calls: ModelToolCall[] = (response.toolCalls ?? []).map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      }));
      if (calls.length === 0) {
        if (response.content)
          this.append(
            turn,
            'agent-message',
            active.agentId,
            { content: response.content },
            correlationId,
            modelItem.id,
          );
        const steeredDuringInference = this.options.store
          .listItems(thread.id)
          .some((item) => item.kind === 'steering-message' && item.sequence > beforeInferenceSequence);
        if (steeredDuringInference) continue;
        const verificationResult = await this.verifyAndFinish(turn, active.environment, correlationId);
        // If verification returned without outcome, it's a revision loop - continue the turn
        if (!verificationResult.outcome) continue;
        return verificationResult;
      }

      await this.transition(turn, 'awaiting-tool', correlationId);
      const outcome = await this.executeToolCalls(turn.id, active, correlationId, calls, modelItem.id);
      if ('approvalId' in outcome)
        return {
          thread: this.requireThread(thread.id),
          turn: this.requireTurn(turn.id),
          approvalId: outcome.approvalId,
        };
      const after = this.requireTurn(turnId);
      if (after.outcome) return { thread: this.requireThread(thread.id), turn: after, outcome: after.outcome };
    }
    return this.finish(turn, 'blocked', 'Harness iteration limit reached', 'iteration-limit', correlationId);
  }

  /**
   * Deterministic sequential tool execution. Each model-returned call is
   * validated, parsed, policy-evaluated, executed, and recorded in order.
   * Failures are appended for the model to react to; approval suspends before
   * that specific call and preserves the remaining queue for restart safety.
   */
  private async executeToolCalls(
    turnId: AgentTurnId,
    active: ActiveRun,
    correlationId: CorrelationId,
    calls: readonly ModelToolCall[],
    causationId: string,
  ): Promise<CallQueueOutcome> {
    const turn = this.requireTurn(turnId);
    const thread = this.requireThread(turn.threadId);
    for (let index = 0; index < calls.length; index++) {
      console.error(
        '[dbg-exec] iter',
        index,
        'of',
        calls.length,
        calls.map((c) => c.name),
      );
      const call = calls[index];
      const current = this.requireTurn(turnId);
      if (current.outcome) return { done: true };
      if (active.controller.signal.aborted || current.state === 'cancelled') return { done: true };
      const callId = call.id as ToolCallId;
      const toolName = call.name;
      const identity = this.identity(thread.id, current.id, correlationId);

      if (!this.options.tools.has(toolName)) {
        await this.appendToolFailure(
          current,
          callId,
          toolName,
          `Tool not found: ${toolName}`,
          'invalid-tool',
          correlationId,
          causationId,
          identity,
        );
        continue;
      }
      let input: unknown;
      try {
        input = parseToolInput(call.arguments);
      } catch (error) {
        await this.appendToolFailure(
          current,
          callId,
          toolName,
          error instanceof Error ? error.message : String(error),
          'invalid-arguments',
          correlationId,
          causationId,
          identity,
        );
        continue;
      }

      const request: ToolCallRequest = {
        callId,
        toolName,
        input,
        agentId: active.agentId,
        taskId: thread.taskId,
        environment: active.environment,
      };
      const toolItem = this.append(
        current,
        'tool-call',
        active.agentId,
        {
          callId: request.callId,
          toolName: request.toolName,
          input: request.input,
          agentId: active.agentId,
          risk: this.toolRiskOf(toolName),
        },
        correlationId,
        causationId,
      );
      await this.emit('harness.tool.proposed', identity, { callId, toolName });
      await this.transition(current, 'executing-tool', correlationId);
      await this.emit('harness.tool.started', identity, { callId, toolName });

      let result: Awaited<ReturnType<ToolRuntime['invoke']>>;
      try {
        result = await this.options.tools.invoke(request, active.controller.signal);
      } catch (error) {
        await this.appendToolFailure(
          this.requireTurn(turnId),
          callId,
          toolName,
          error instanceof Error ? error.message : String(error),
          'tool-invocation-failed',
          correlationId,
          toolItem.id,
          identity,
        );
        continue;
      }

      if (result.status === 'approval-required') {
        const approvalId = id('approval') as ApprovalRequestId;
        const pendingCalls: PendingToolCall[] = calls.slice(index + 1).map((pending) => ({
          callId: pending.id as ToolCallId,
          toolName: pending.name,
          arguments: pending.arguments,
        }));
        const payload: ApprovalRequestPayload & {
          affectedResources?: readonly string[];
          pendingCalls: PendingToolCall[];
        } = {
          approvalId,
          callId: request.callId,
          toolName: request.toolName,
          reason: result.reason,
          risk: result.risk,
          affectedResources: result.affectedResources,
          pendingCalls,
        };
        this.append(turn, 'approval-request', 'policy-runtime', payload, correlationId, toolItem.id);
        await this.transition(turn, 'awaiting-approval', correlationId);
        await this.emit('harness.approval.requested', identity, {
          approvalId,
          callId: request.callId,
          toolName: request.toolName,
          reason: result.reason,
          risk: result.risk,
          pendingCalls,
        });
        return { approvalId };
      }

      // A cancellation may have already written a terminal outcome while the
      // tool was executing; do not append a result after final-outcome.
      const afterInvoke = this.requireTurn(turnId);
      if (afterInvoke.outcome) return { done: true };

      await this.recordToolResult(turn, request, result, correlationId, toolItem.id);
      if (result.status === 'denied') {
        await this.emit('harness.tool.failed', identity, { callId, toolName, error: result.reason });
        this.finish(turn, 'blocked', result.reason ?? 'Tool denied', 'tool-denied', correlationId);
        return { done: true };
      }
      if (result.status === 'cancelled') {
        this.finish(turn, 'cancelled', result.error ?? 'Tool cancelled', 'tool-cancelled', correlationId);
        return { done: true };
      }
      if (result.status === 'failed') {
        await this.emit('harness.tool.failed', identity, {
          callId,
          toolName,
          error: result.error ?? ('reason' in result ? result.reason : undefined),
        });
        continue;
      }
      await this.emit('harness.tool.completed', identity, { callId, toolName });
    }
    return { done: true };
  }

  private async appendToolFailure(
    turn: AgentTurn,
    callId: ToolCallId,
    toolName: string,
    message: string,
    reasonCode: string,
    correlationId: CorrelationId,
    causationId: string,
    identity: HarnessEventIdentity,
  ): Promise<void> {
    this.append(
      turn,
      'tool-result',
      'tool-runtime',
      { callId, toolName, status: 'failed' as const, error: message, evidence: [] },
      correlationId,
      causationId,
    );
    await this.emit('harness.tool.failed', identity, { callId, toolName, error: message, reasonCode });
  }

  private async verifyAndFinish(
    turn: AgentTurn,
    environment: AgentEnvironment,
    correlationId: CorrelationId,
  ): Promise<HarnessRunResult> {
    await this.transition(turn, 'verifying', correlationId);
    const thread = this.requireThread(turn.threadId);
    const identity = this.identity(thread.id, turn.id, correlationId);
    await this.emit('harness.verification.started', identity, {});
    const result = await this.options.verifier.verify({
      thread,
      turn: this.requireTurn(turn.id),
      replay: this.options.store.replay(thread.id),
      environment,
    });
    this.append(turn, 'verification-result', 'verification-runtime', { ...result }, correlationId);
    await this.emit('harness.verification.completed', identity, {
      status: result.status,
      confidence: result.confidence,
      checks: result.checks.length,
    });
    if (result.status === 'passed')
      return this.finish(turn, 'completed', 'Verification passed', undefined, correlationId);
    // Revision loop: if verification fails and we haven't exceeded max revisions,
    // allow the agent to retry with feedback
    if (result.status === 'failed' && this.countRevisions(turn.id) < this.maxRevisions) {
      const revisionCount = this.countRevisions(turn.id) + 1;
      this.append(
        turn,
        'revision-request',
        'verification-runtime',
        {
          revisionNumber: revisionCount,
          feedback: result.checks.map((c) => `${c.name}: ${c.status} - ${c.summary}`).join('\n'),
        },
        correlationId,
      );
      await this.emit('harness.revision.requested', identity, {
        revisionNumber: revisionCount,
        feedback: result.checks,
      });
      // Transition back to preparing to allow the agent to retry
      await this.transition(turn, 'preparing', correlationId);
      // Return without a final outcome - the harness will continue the turn loop
      return { thread: this.requireThread(turn.threadId), turn: this.requireTurn(turn.id) };
    }
    if (result.status === 'blocked' || result.status === 'inconclusive')
      return this.finish(
        turn,
        'blocked',
        `Verification ${result.status}`,
        `verification-${result.status}`,
        correlationId,
      );
    return this.finish(turn, 'failed', 'Verification failed', 'verification-failed', correlationId);
  }

  private countRevisions(turnId: AgentTurnId): number {
    const threadId = this.options.store.getTurn(turnId)?.threadId;
    if (!threadId) return 0;
    const items = this.options.store.listItems(threadId, turnId);
    return items.filter((item) => item.kind === 'revision-request').length;
  }

  private async recordToolResult(
    turn: AgentTurn,
    request: ToolCallRequest,
    result: Awaited<ReturnType<ToolRuntime['invoke']>>,
    correlationId: CorrelationId,
    causationId: string,
  ): Promise<void> {
    if (result.status === 'approval-required') return;
    const payload: ToolResultPayload = {
      callId: request.callId,
      toolName: request.toolName,
      status: result.status === 'denied' ? 'failed' : result.status,
      output: 'output' in result ? result.output : undefined,
      error: 'reason' in result ? result.reason : result.error,
      evidence: 'evidence' in result ? result.evidence : [],
    };
    this.append(turn, 'tool-result', 'tool-runtime', payload, correlationId, causationId);
  }

  private messages(threadId: TaskThreadId, context: string): CompletionRequest['messages'] {
    const items = this.options.store.listItems(threadId);
    const { summary, recent } = compactContext(items, this.maxContextItems);
    const messages: CompletionRequest['messages'] = [{ role: 'system', content: context }];
    if (summary) messages.push({ role: 'system', content: summary });
    for (const item of recent) {
      const payload = record(item.payload);
      if (item.kind === 'user-message' || item.kind === 'steering-message')
        messages.push({ role: 'user', content: String(payload.content ?? '') });
      else if (item.kind === 'agent-message')
        messages.push({ role: 'assistant', content: String(payload.content ?? '') });
      else if (item.kind === 'tool-result') messages.push({ role: 'tool', content: JSON.stringify(payload) });
    }
    return messages;
  }

  private toolRequestFromItem(thread: TaskThread, item: ThreadItem, active: ActiveRun): ToolCallRequest {
    const payload = record(item.payload);
    return {
      callId: stringField(payload, 'callId') as ToolCallId,
      toolName: stringField(payload, 'toolName'),
      input: payload.input,
      agentId: active.agentId,
      taskId: thread.taskId,
      environment: active.environment,
    };
  }

  private toolRiskOf(toolName: string): ToolRisk {
    return this.options.tools.list().find((tool) => tool.name === toolName)?.risk ?? 'low';
  }

  private append<TPayload extends Readonly<Record<string, unknown>>>(
    turn: AgentTurn,
    kind: AppendThreadItemInput<TPayload>['kind'],
    actorId: string,
    payload: TPayload,
    correlationId: CorrelationId,
    causationId?: string,
  ): ThreadItem<TPayload> {
    return this.options.store.appendItem({
      threadId: turn.threadId,
      turnId: turn.id,
      kind,
      actorId,
      payload,
      correlationId,
      causationId: causationId as AppendThreadItemInput<TPayload>['causationId'],
    });
  }

  private async transition(turn: AgentTurn, state: AgentRunState, correlationId: CorrelationId): Promise<AgentTurn> {
    console.error('[dbg-transition]', state);
    const current = this.requireTurn(turn.id);
    if (terminalOutcome(current.state) || current.state === state) return current;
    const updated = this.options.store.transitionTurn(turn.id, state);
    this.append(updated, 'state-transition', 'agent-harness', { from: current.state, to: state }, correlationId);
    await this.emit('harness.state.changed', this.identity(turn.threadId, updated.id, correlationId), {
      from: current.state,
      to: state,
    });
    return updated;
  }

  private finish(
    turn: AgentTurn,
    state: AgentRunOutcome['state'],
    summary: string,
    reasonCode: string | undefined,
    correlationId: CorrelationId,
  ): HarnessRunResult {
    const current = this.requireTurn(turn.id);
    if (current.outcome) return { thread: this.requireThread(turn.threadId), turn: current, outcome: current.outcome };
    const outcome: AgentRunOutcome = { state, summary, reasonCode, completedAt: new Date().toISOString() };
    const updated = this.options.store.transitionTurn(turn.id, state, outcome);
    this.append(updated, 'final-outcome', 'agent-harness', { ...outcome }, correlationId);
    this.options.store.updateThreadStatus(turn.threadId, state === 'completed' ? 'completed' : state);
    void this.emit(`harness.outcome.${state}`, this.identity(turn.threadId, updated.id, correlationId), {
      summary,
      reasonCode,
      state,
    });
    return { thread: this.requireThread(turn.threadId), turn: updated, outcome };
  }

  private runIdentity(threadId: TaskThreadId): { runId: string; agentId: string } | undefined {
    const item = this.options.store.listItems(threadId).find((entry) => entry.kind === 'harness-run');
    if (!item) return undefined;
    const payload = record(item.payload);
    return { runId: String(payload.runId ?? ''), agentId: String(payload.agentId ?? '') };
  }

  private identity(
    threadId: TaskThreadId,
    turnId: AgentTurnId,
    correlationId: CorrelationId,
    causationId?: string,
  ): HarnessEventIdentity {
    const run = this.runIdentity(threadId);
    return {
      threadId,
      turnId,
      runId: run?.runId ?? '',
      agentId: run?.agentId ?? '',
      correlationId,
      causationId,
    };
  }

  private correlationForTurn(threadId: TaskThreadId, turnId: AgentTurnId): CorrelationId {
    return this.options.store.listItems(threadId, turnId)[0]?.correlationId ?? (id('correlation') as CorrelationId);
  }

  private async emit(type: string, identity: HarnessEventIdentity, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.options.eventBus?.emit({
        type,
        source: 'agent-harness',
        actor: { id: identity.agentId || 'agent-harness', role: 'system' },
        payload: { ...identity, ...payload },
        metadata: { correlationId: identity.correlationId, causationId: identity.causationId },
      });
    } catch {
      /* projection persistence must never break the harness run */
    }
  }

  private requireThread(id: TaskThreadId): TaskThread {
    const thread = this.options.store.getThread(id);
    if (!thread) throw new Error(`Thread not found: ${id}`);
    return thread;
  }

  private requireTurn(id: AgentTurnId): AgentTurn {
    const turn = this.options.store.getTurn(id);
    if (!turn) throw new Error(`Turn not found: ${id}`);
    return turn;
  }
}
