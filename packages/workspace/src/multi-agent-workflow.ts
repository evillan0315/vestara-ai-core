/**
 * MultiAgentWorkflowOrchestrator — ADR-118 sequential multi-agent orchestration.
 *
 * The orchestrator is the single writer of workflow state: it owns the stage
 * plan (planner → developer → verifier → reviewer by default), and each stage
 * runs as its own durable harness thread tagged with a shared `workflowId`.
 * The cross-thread projection (`projectWorkflowAcrossThreads`) later merges
 * those sibling threads into one canonical eight-stage workflow.
 *
 * Design notes:
 *   • Each agent stage is a first-class durable thread, so every stage is
 *     independently replayable, approvable, steerable, and resumable.
 *   • The orchestrator never mutates a thread mid-turn; it only chains
 *     outputs and awaits each stage before dispatching the next.
 *   • Approval blocking pauses the chain at the owning stage; resolving the
 *     approval (via the API) then `resume()` continues from the first
 *     non-terminal sibling.
 */

import type { AgentHarnessRuntime, HarnessRunResult } from '@vestara/agent-harness';
import type { AgentEnvironment, TaskThreadId } from '@vestara/types';
import type { HarnessSession } from './harness-session';

export interface ChangeProjectorLike {
  captureBaseline(input: { threadId: TaskThreadId; taskId?: string; agentId?: string }): Promise<void>;
  projectChanges(input: { threadId: TaskThreadId; taskId?: string; agentId?: string }): Promise<unknown>;
}

export interface MultiAgentStageSpec {
  readonly role: string;
  readonly agentId: string;
  readonly instruction: string;
}

export interface MultiAgentWorkflowStartInput {
  readonly goal: string;
  readonly stages: readonly MultiAgentStageSpec[];
  readonly workflowId?: string;
}

export interface MultiAgentStageRecord {
  readonly role: string;
  readonly agentId: string;
  readonly threadId: string;
}

export interface MultiAgentWorkflowStart {
  readonly workflowId: string;
  readonly goal: string;
  readonly stages: readonly MultiAgentStageRecord[];
}

export interface MultiAgentWorkflowOptions {
  readonly session: HarnessSession;
  changeProjector?: ChangeProjectorLike;
}

const DEFAULT_STAGES: readonly MultiAgentStageSpec[] = [
  {
    role: 'planner',
    agentId: 'agent-planner',
    instruction: 'Analyze the goal, inspect the workspace, and produce a concrete implementation plan.',
  },
  {
    role: 'developer',
    agentId: 'agent-developer',
    instruction: 'Implement the plan: create or update files, run builds and tests, and report what changed.',
  },
  {
    role: 'verifier',
    agentId: 'agent-verifier',
    instruction:
      'Verify the implementation: run the verification profile, check the changed files, and report findings.',
  },
  {
    role: 'reviewer',
    agentId: 'agent-reviewer',
    instruction: 'Review the diff and verification results. Approve or request revisions with specific feedback.',
  },
];

let workflowCounter = 0;

function nextWorkflowId(): string {
  return `wf-${Date.now()}-${++workflowCounter}`;
}

function stageRole(agentId: string): string {
  const lower = agentId.toLowerCase();
  if (lower.includes('verif')) return 'verifier';
  if (lower.includes('review')) return 'reviewer';
  if (lower.includes('plan') || lower.includes('architect')) return 'planner';
  if (lower.includes('dev') || lower.includes('implement')) return 'developer';
  if (lower.includes('analyst') || lower.includes('investigat')) return 'analyst';
  return 'developer';
}

export class MultiAgentWorkflowOrchestrator {
  private readonly session: HarnessSession;

  constructor(private readonly options: MultiAgentWorkflowOptions) {
    this.session = options.session;
  }

  get changeProjector(): ChangeProjectorLike | undefined {
    return this.options.changeProjector;
  }

  set changeProjector(projector: ChangeProjectorLike | undefined) {
    this.options.changeProjector = projector;
  }

  /**
   * Build the default stage plan for a goal. `agentIds` (optional) maps a role
   * name to an agent id and overrides the defaults; unknown roles are ignored.
   */
  stagesFromGoal(goal: string, agentIds?: unknown): readonly MultiAgentStageSpec[] {
    const overrides =
      agentIds && typeof agentIds === 'object' && !Array.isArray(agentIds) ? (agentIds as Record<string, unknown>) : {};
    return DEFAULT_STAGES.map((stage) => {
      const agentId =
        typeof overrides[stage.role] === 'string' && overrides[stage.role]
          ? String(overrides[stage.role])
          : stage.agentId;
      return { ...stage, agentId, instruction: `${stage.instruction}\n\nGoal: ${goal}` };
    });
  }

  get harness(): AgentHarnessRuntime {
    return this.session.harness;
  }

  get environment(): AgentEnvironment {
    return this.session.environment;
  }

  /**
   * Start a multi-agent workflow. Creates one durable thread per stage, all
   * tagged with the shared workflowId, then executes the chain in the
   * background. Returns immediately with the workflow + thread identifiers.
   */
  async start(input: MultiAgentWorkflowStartInput): Promise<MultiAgentWorkflowStart> {
    const workflowId = input.workflowId ?? nextWorkflowId();
    const stages: MultiAgentStageRecord[] = [];
    const taskId = `task-${Date.now()}`;

    for (const [index, spec] of input.stages.entries()) {
      const thread = this.session.harness.createThread({
        taskId: `${taskId}-${index}`,
        title: `${spec.agentId}: ${spec.instruction.slice(0, 120)}`,
        environment: this.environment,
        metadata: {
          agentId: spec.agentId,
          role: spec.role ?? stageRole(spec.agentId),
          workflowId,
          runSource: 'multi-agent',
          stageIndex: index,
        },
      });
      await this.session
        .createForRun({ threadId: thread.id, goal: input.goal, agentId: spec.agentId })
        .catch(() => null);
      void this.changeProjector
        ?.captureBaseline({ threadId: thread.id as TaskThreadId, taskId: `${taskId}-${index}`, agentId: spec.agentId })
        .catch(() => {});
      stages.push({ role: spec.role ?? stageRole(spec.agentId), agentId: spec.agentId, threadId: thread.id });
    }

    void this.executeChain(
      workflowId,
      input.stages,
      stages.map((stage) => stage.threadId),
    ).catch((error: unknown) => {
      this.session.harness.eventBus?.emit({
        type: 'multi-agent-workflow.failed',
        source: 'multi-agent-workflow',
        payload: {
          workflowId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });

    return { workflowId, goal: input.goal, stages };
  }

  /** Run the sequential stage chain, threading the prior stage output forward. */
  private async executeChain(
    workflowId: string,
    specs: readonly MultiAgentStageSpec[],
    threadIds: readonly string[],
  ): Promise<void> {
    let previousOutput: string | undefined;
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index];
      const threadId = threadIds[index] as TaskThreadId;
      const result = await this.runStage(spec, threadId, previousOutput);
      await this.syncStage(threadId);
      if (result.approvalId) return; // paused at approval; resume() continues
      const state = result.turn.state;
      if (state !== 'completed') return; // chain stops on non-terminal outcome
      previousOutput = result.turn.outcome?.summary ?? previousOutput;
    }
    this.session.harness.eventBus?.emit({
      type: 'multi-agent-workflow.completed',
      source: 'multi-agent-workflow',
      payload: { workflowId },
    });
  }

  private async runStage(
    spec: MultiAgentStageSpec,
    threadId: TaskThreadId,
    previousOutput: string | undefined,
  ): Promise<HarnessRunResult> {
    const instruction = previousOutput
      ? `${spec.instruction}\n\nPrior stage output:\n${previousOutput}`
      : spec.instruction;
    return this.session.harness.run({
      threadId,
      instruction,
      agentId: spec.agentId,
      environment: this.environment,
    });
  }

  private async syncStage(threadId: string): Promise<void> {
    await this.session.syncFromReplay(threadId).catch(() => null);
    const thread = this.session.harness.listThreads().find((candidate) => candidate.id === threadId);
    void this.changeProjector
      ?.projectChanges({
        threadId: threadId as TaskThreadId,
        taskId: thread?.taskId ?? threadId,
        agentId: String(thread?.metadata?.agentId ?? 'agent'),
      })
      .catch(() => {});
  }

  /** Durable discovery of sibling stage threads for a workflow. */
  siblingThreads(workflowIdOrThreadId: string): readonly { id: string; metadata: Readonly<Record<string, unknown>> }[] {
    const threads = this.session.harness.listThreads();
    const target = threads.find((thread) => thread.id === workflowIdOrThreadId);
    const workflowId = target?.metadata?.workflowId ?? workflowIdOrThreadId;
    return threads
      .filter((thread) => thread.metadata?.workflowId === workflowId)
      .sort((left, right) => Number(left.metadata?.stageIndex ?? 0) - Number(right.metadata?.stageIndex ?? 0))
      .map((thread) => ({ id: thread.id, metadata: thread.metadata }));
  }

  /**
   * Continue a paused or interrupted workflow from the first non-terminal
   * sibling thread. Threads already completed are skipped; a thread still
   * awaiting approval is resolved by the caller before resuming. Returns the
   * first threadId still executing, or null when the chain is terminal.
   */
  async resume(workflowId: string): Promise<string | null> {
    const siblings = this.siblingThreads(workflowId);
    for (const sibling of siblings) {
      const snapshot = this.session.harness.snapshot(sibling.id as TaskThreadId);
      const state = snapshot.state;
      if (state === 'completed' || state === 'blocked' || state === 'failed' || state === 'cancelled') continue;
      if (state === 'awaiting-approval') continue; // caller must resolve first
      const spec: MultiAgentStageSpec = {
        role: String(sibling.metadata.role ?? stageRole(String(sibling.metadata.agentId ?? 'agent'))),
        agentId: String(sibling.metadata.agentId ?? 'agent'),
        instruction: this.instructionFor(sibling.id as TaskThreadId),
      };
      void this.executeChain(workflowId, [spec], [sibling.id]).catch(() => {});
      return sibling.id;
    }
    return null;
  }

  private instructionFor(threadId: TaskThreadId): string {
    const replay = this.session.harness.replay(threadId);
    const userMessage = replay.items.find((item) => item.kind === 'user-message');
    const payload = userMessage?.payload as { content?: unknown } | undefined;
    return typeof payload?.content === 'string' ? payload.content : 'Continue the workflow';
  }
}
