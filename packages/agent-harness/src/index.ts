import type { EventBus } from '@vestara/event-bus';
import type { AIProvider, CompletionRequest } from '@vestara/shared';
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
} from '@vestara/types';

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

interface ActiveRun {
  readonly controller: AbortController;
  readonly environment: AgentEnvironment;
  readonly agentId: string;
}

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

export class AgentHarnessRuntime {
  private readonly active = new Map<TaskThreadId, ActiveRun>();
  private readonly environments = new Map<string, AgentEnvironment>();
  private readonly maxIterations: number;

  constructor(private readonly options: AgentHarnessOptions) {
    this.maxIterations = options.maxIterations ?? 12;
  }

  createThread(input: StartThreadInput): TaskThread {
    this.environments.set(input.environment.id, input.environment);
    return this.options.store.createThread({
      taskId: input.taskId,
      title: input.title,
      environmentId: input.environment.id,
      metadata: input.metadata,
    });
  }

  async run(input: RunTurnInput): Promise<HarnessRunResult> {
    const thread = this.requireThread(input.threadId);
    if (thread.environmentId !== input.environment.id) throw new Error('Environment does not match thread lease');
    if (this.active.has(input.threadId)) throw new Error(`Thread already has an active run: ${input.threadId}`);
    this.environments.set(input.environment.id, input.environment);
    const turn = this.options.store.createTurn({ threadId: input.threadId, input: input.instruction });
    const correlationId = id('correlation') as CorrelationId;
    this.append(turn, 'user-message', 'user', { content: input.instruction }, correlationId);
    const active: ActiveRun = {
      controller: new AbortController(),
      environment: input.environment,
      agentId: input.agentId,
    };
    this.active.set(input.threadId, active);
    try {
      return await this.continueTurn(turn.id, active, correlationId);
    } finally {
      this.active.delete(input.threadId);
    }
  }

  async decideApproval(
    threadId: TaskThreadId,
    approvalId: ApprovalRequestId,
    approved: boolean,
    environment?: AgentEnvironment,
  ): Promise<HarnessRunResult> {
    if (this.active.has(threadId)) throw new Error(`Thread already has an active run: ${threadId}`);
    const thread = this.requireThread(threadId);
    const turn = this.options.store.getActiveTurn(threadId);
    if (turn?.state !== 'awaiting-approval') throw new Error('Thread is not awaiting approval');
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
    this.append(
      turn,
      'approval-decision',
      'user',
      { approvalId, callId, decision: approved ? 'approved' : 'rejected' },
      correlationId,
      approval.id,
    );
    if (!approved) return this.finish(turn, 'blocked', 'Approval was rejected', 'approval-rejected', correlationId);

    const resolvedEnvironment = environment ?? this.environments.get(thread.environmentId);
    if (!resolvedEnvironment)
      throw new Error(`Environment must be reattached to resume thread: ${thread.environmentId}`);
    if (resolvedEnvironment.id !== thread.environmentId) throw new Error('Environment does not match thread lease');
    this.environments.set(resolvedEnvironment.id, resolvedEnvironment);
    const active: ActiveRun = {
      controller: new AbortController(),
      environment: resolvedEnvironment,
      agentId: String(record(toolCall.payload).agentId ?? 'agent'),
    };
    this.active.set(threadId, active);
    try {
      const invocation = this.toolRequestFromItem(thread, toolCall, active);
      const result = await this.options.tools.invoke(invocation, active.controller.signal, true);
      await this.recordToolResult(turn, invocation, result, correlationId, toolCall.id);
      if (result.status !== 'completed') {
        const state = result.status === 'cancelled' ? 'cancelled' : 'failed';
        const error = 'error' in result ? result.error : 'reason' in result ? result.reason : undefined;
        return this.finish(turn, state, error ?? `Tool ${result.status}`, `tool-${result.status}`, correlationId);
      }
      return await this.continueTurn(turn.id, active, correlationId);
    } finally {
      this.active.delete(threadId);
    }
  }

  steer(threadId: TaskThreadId, message: string, actorId = 'user'): ThreadItem {
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    const correlationId = this.correlationForTurn(threadId, turn.id);
    const item = this.append(turn, 'steering-message', actorId, { content: message }, correlationId);
    void this.emit('agent.turn.steered', threadId, turn, { itemId: item.id });
    return item;
  }

  cancel(threadId: TaskThreadId, reason = 'Cancelled by user'): AgentTurn {
    const turn = this.options.store.getActiveTurn(threadId);
    if (!turn) throw new Error(`No active turn for thread: ${threadId}`);
    this.active.get(threadId)?.controller.abort(reason);
    const correlationId = this.correlationForTurn(threadId, turn.id);
    return this.finish(turn, 'cancelled', reason, 'cancelled-by-user', correlationId).turn;
  }

  replay(threadId: TaskThreadId): ThreadReplay {
    return this.options.store.replay(threadId);
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
      if (active.controller.signal.aborted || turn.state === 'cancelled') {
        return this.finish(turn, 'cancelled', 'Run cancelled', 'cancelled', correlationId);
      }
      await this.transition(turn, 'reasoning', correlationId);
      const beforeInferenceSequence = this.options.store.listItems(thread.id).at(-1)?.sequence ?? 0;
      let response;
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
      const call = response.toolCalls?.[0];
      if (!call) {
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
        return await this.verifyAndFinish(turn, active.environment, correlationId);
      }

      await this.transition(turn, 'awaiting-tool', correlationId);
      const request: ToolCallRequest = {
        callId: call.id as ToolCallId,
        toolName: call.name,
        input: parseToolInput(call.arguments),
        agentId: active.agentId,
        taskId: thread.taskId,
        environment: active.environment,
      };
      const toolItem = this.append(
        turn,
        'tool-call',
        active.agentId,
        { callId: request.callId, toolName: request.toolName, input: request.input, agentId: active.agentId },
        correlationId,
        modelItem.id,
      );
      const result = await this.options.tools.invoke(request, active.controller.signal);
      if (result.status === 'approval-required') {
        const approvalId = id('approval') as ApprovalRequestId;
        const payload: ApprovalRequestPayload = {
          approvalId,
          callId: request.callId,
          toolName: request.toolName,
          reason: result.reason,
          risk: result.risk,
        };
        this.append(turn, 'approval-request', 'policy-runtime', payload, correlationId, toolItem.id);
        await this.transition(turn, 'awaiting-approval', correlationId);
        await this.emit('approval.requested', thread.id, turn, { approvalId, toolName: request.toolName });
        return { thread: this.requireThread(thread.id), turn: this.requireTurn(turn.id), approvalId };
      }
      await this.recordToolResult(turn, request, result, correlationId, toolItem.id);
      if (result.status !== 'completed') {
        const terminal =
          result.status === 'cancelled' ? 'cancelled' : result.status === 'denied' ? 'blocked' : 'failed';
        const message = 'reason' in result ? result.reason : (result.error ?? `Tool ${result.status}`);
        return this.finish(turn, terminal, message, `tool-${result.status}`, correlationId);
      }
    }
    return this.finish(turn, 'blocked', 'Harness iteration limit reached', 'iteration-limit', correlationId);
  }

  private async verifyAndFinish(
    turn: AgentTurn,
    environment: AgentEnvironment,
    correlationId: CorrelationId,
  ): Promise<HarnessRunResult> {
    await this.transition(turn, 'verifying', correlationId);
    const thread = this.requireThread(turn.threadId);
    const result = await this.options.verifier.verify({
      thread,
      turn: this.requireTurn(turn.id),
      replay: this.options.store.replay(thread.id),
      environment,
    });
    this.append(turn, 'verification-result', 'verification-runtime', { ...result }, correlationId);
    if (result.status === 'passed')
      return this.finish(turn, 'completed', 'Verification passed', undefined, correlationId);
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
    await this.emit('tool.call.completed', turn.threadId, turn, {
      callId: request.callId,
      toolName: request.toolName,
      status: result.status,
    });
  }

  private messages(threadId: TaskThreadId, context: string): CompletionRequest['messages'] {
    const messages: CompletionRequest['messages'] = [{ role: 'system', content: context }];
    for (const item of this.options.store.listItems(threadId)) {
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
    const current = this.requireTurn(turn.id);
    if (['completed', 'failed', 'cancelled'].includes(current.state)) return current;
    const updated = this.options.store.transitionTurn(turn.id, state);
    this.append(updated, 'state-transition', 'agent-harness', { from: current.state, to: state }, correlationId);
    await this.emit('agent.turn.state-changed', turn.threadId, updated, { from: current.state, to: state });
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
    void this.emit(`task.${state}`, turn.threadId, updated, { summary, reasonCode });
    return { thread: this.requireThread(turn.threadId), turn: updated, outcome };
  }

  private correlationForTurn(threadId: TaskThreadId, turnId: AgentTurnId): CorrelationId {
    return this.options.store.listItems(threadId, turnId)[0]?.correlationId ?? (id('correlation') as CorrelationId);
  }

  private async emit(
    type: string,
    threadId: TaskThreadId,
    turn: AgentTurn,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.options.eventBus?.emit({
      type,
      source: 'agent-harness',
      actor: { id: 'agent-harness', role: 'system' },
      payload: { threadId, turnId: turn.id, ...payload },
      metadata: { correlationId: this.correlationForTurn(threadId, turn.id) },
    });
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
