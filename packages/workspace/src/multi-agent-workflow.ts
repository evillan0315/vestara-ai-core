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
import {
  type AcceptanceBoundary,
  parseAcceptanceDeclaration,
  refineAcceptanceBoundary,
  renderAcceptanceBoundary,
  seedAcceptanceBoundary,
} from './acceptance-boundary';
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
    agentId: 'vestara-planner',
    instruction:
      'Analyze the goal, inspect the workspace, and produce a concrete implementation plan. ' +
      'After your plan, declare the acceptance boundary: list the observable acceptance ' +
      'obligations derived from the goal, and any material uncertainties about your ' +
      'interpretation that could affect acceptance.',
  },
  {
    role: 'developer',
    agentId: 'vestara-developer',
    instruction: 'Implement the plan: create or update files, run builds and tests, and report what changed.',
  },
  {
    role: 'verifier',
    agentId: 'vestara-verifier',
    instruction:
      'Verify the implementation: run the verification profile, check the changed files, and report findings. ' +
      'Distinguish implementation-quality verification from behavioral acceptance: state, for each acceptance ' +
      'obligation, whether available evidence establishes it, or NOT ESTABLISHED. Build/lint/test/diff results ' +
      'support implementation conclusions only; they do not by themselves establish product acceptance.',
  },
  {
    role: 'reviewer',
    agentId: 'vestara-reviewer',
    instruction:
      'Review the diff and verification results. Approve or request revisions with specific feedback. ' +
      'Review against the acceptance boundary (objective and obligations), not only diff correctness. ' +
      'Flag any interpretation, implementation, or verification that substitutes or weakens the acceptance object.',
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
  private readonly acceptanceBoundaries = new Map<string, AcceptanceBoundary>();

  constructor(private readonly options: MultiAgentWorkflowOptions) {
    this.session = options.session;
  }

  /** The durable acceptance boundary for a workflow (objective + obligations + uncertainty). */
  acceptanceBoundary(workflowId: string): AcceptanceBoundary | undefined {
    return this.acceptanceBoundaries.get(workflowId);
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
    // The acceptance boundary is seeded from the authorized objective and
    // remains the authoritative anchor for every downstream stage.
    this.acceptanceBoundaries.set(workflowId, seedAcceptanceBoundary(workflowId, input.goal));

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

    // Structured organizational event: the workflow started with a derived stage plan.
    this.session.harness.eventBus?.emit({
      type: 'workflow.started',
      source: 'multi-agent-workflow',
      payload: {
        workflowId,
        goal: input.goal,
        stages: stages.map((stage) => ({ role: stage.role, agentId: stage.agentId })),
      },
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
      // The interpreting stage may refine the acceptance boundary from its own
      // declared output. The boundary is never derived from a stage summary.
      this.refineFromStageOutput(workflowId, threadId, spec.role);
    }
    const boundary = this.acceptanceBoundaries.get(workflowId);
    this.session.harness.eventBus?.emit({
      type: 'multi-agent-workflow.completed',
      source: 'multi-agent-workflow',
      payload: {
        workflowId,
        conditional: boundary?.conditional === true,
        acceptance: boundary,
      },
    });
    this.session.harness.eventBus?.emit({
      type: 'workflow.completed',
      source: 'multi-agent-workflow',
      payload: {
        workflowId,
        conditional: boundary?.conditional === true,
        acceptance: boundary,
      },
    });
  }

  private async runStage(
    spec: MultiAgentStageSpec,
    threadId: TaskThreadId,
    previousOutput: string | undefined,
  ): Promise<HarnessRunResult> {
    const instruction = this.instructionForStage(spec, threadId, previousOutput);
    return this.session.harness.run({
      threadId,
      instruction,
      agentId: spec.agentId,
      environment: this.environment,
    });
  }

  /**
   * Compose a stage instruction: the authoritative acceptance boundary (from
   * the workflow record, never an upstream summary), then the stage's own
   * instruction, then the prior implementation output as context.
   */
  private instructionForStage(
    spec: MultiAgentStageSpec,
    threadId: TaskThreadId,
    previousOutput: string | undefined,
  ): string {
    const workflowId = this.workflowIdForThread(threadId);
    const boundary = workflowId ? this.acceptanceBoundaries.get(workflowId) : undefined;
    const parts = [];
    if (boundary) parts.push(renderAcceptanceBoundary(boundary));
    parts.push(spec.instruction);
    if (previousOutput)
      parts.push(`Prior stage output (implementation context, not authoritative):\n${previousOutput}`);
    return parts.join('\n\n');
  }

  private workflowIdForThread(threadId: TaskThreadId): string | undefined {
    const thread = this.session.harness.listThreads().find((candidate) => candidate.id === threadId);
    const workflowId = thread?.metadata?.workflowId;
    return typeof workflowId === 'string' ? workflowId : undefined;
  }

  /** Refine the boundary from the stage's declared acceptance block, if any. */
  private refineFromStageOutput(workflowId: string, threadId: TaskThreadId, role: string): void {
    const output = this.lastModelResponse(threadId);
    if (!output) return;
    const declaration = parseAcceptanceDeclaration(output);
    if (!declaration) return;
    const current = this.acceptanceBoundaries.get(workflowId);
    if (!current) return;
    const refined = refineAcceptanceBoundary(current, { ...declaration, derivedBy: role });
    this.acceptanceBoundaries.set(workflowId, refined);
    // Structured organizational event: the acceptance boundary was derived.
    this.session.harness.eventBus?.emit({
      type: 'acceptance.boundary',
      source: 'multi-agent-workflow',
      payload: {
        workflowId,
        boundary: refined,
      },
    });
  }

  private lastModelResponse(threadId: TaskThreadId): string | undefined {
    const replay = this.session.harness.replay(threadId);
    const items = [...replay.items].reverse();
    const response = items.find((item) => item.kind === 'model-response');
    const payload = response?.payload as { content?: unknown } | undefined;
    return typeof payload?.content === 'string' ? payload.content : undefined;
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
