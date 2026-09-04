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
import type { RuntimeSessionRegistry } from '@vestara/opencode-runtime';
import type {
  AgentEnvironment,
  RuntimeSessionBinding,
  RuntimeSessionId,
  TaskThreadId,
  WorkflowRunId,
} from '@vestara/types';
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
  /** M7: Runtime session continuity registry. */
  readonly runtimeSessionRegistry?: RuntimeSessionRegistry;
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

/**
 * Named multi-agent workflow templates. Each is a curated, goal-tailored stage
 * plan (role + agent + instruction) startable from the Workspace WorkflowRail.
 * `'default'` is the generic pipeline used when no template is requested.
 */
export type MultiAgentWorkflowTemplateId = 'default' | 'agent-control-restructure' | 'activity-room-premium-redesign';

export interface MultiAgentWorkflowTemplate {
  readonly id: MultiAgentWorkflowTemplateId;
  readonly name: string;
  readonly description: string;
  readonly stages: readonly MultiAgentStageSpec[];
}

export const MULTI_AGENT_WORKFLOW_TEMPLATES: Record<MultiAgentWorkflowTemplateId, MultiAgentWorkflowTemplate> = {
  default: {
    id: 'default',
    name: 'Standard pipeline',
    description: 'planner → developer → verifier → reviewer.',
    stages: DEFAULT_STAGES,
  },
  'agent-control-restructure': {
    id: 'agent-control-restructure',
    name: 'Restructure Agent Control',
    description:
      'Refactor the Agent Control Center page (apps/workspace/src/pages/Agents.tsx) from a monolithic ' +
      'component into focused, testable sub-components without changing behavior.',
    stages: [
      {
        role: 'planner',
        agentId: 'vestara-planner',
        instruction:
          'Analyze apps/workspace/src/pages/Agents.tsx and its supporting components under ' +
          'apps/workspace/src/pages/Agents/. Produce a concrete restructure plan that decomposes the ' +
          'monolithic page into focused, testable sub-components (header/stat cards, filters, category ' +
          'list, expanded agent panel, execution history, teams, live activity) with a clear state ' +
          'ownership map. Preserve all existing behavior, class names, and props. Do NOT introduce new ' +
          'feature behavior — this is a structural refactor only. Declare the acceptance boundary: list ' +
          'the observable obligations (page renders identically, tests pass, no dead state) and any ' +
          'uncertainties.',
      },
      {
        role: 'developer',
        agentId: 'vestara-developer',
        instruction:
          'Execute the Agent Control restructure plan: extract the identified sub-components, move ' +
          'co-located state into the owning components, and keep the page composition in ' +
          'Agents.tsx. Do not change visible behavior, styling, class names, or API contracts. Keep ' +
          'existing tests green and add focused tests for any extracted component that was previously ' +
          'untested. Run the workspace build and the affected tests, and report what changed.',
      },
      {
        role: 'verifier',
        agentId: 'vestara-verifier',
        instruction:
          'Verify the Agent Control restructure: run the workspace build and the affected component tests, ' +
          'check the changed files for correctness, and confirm no dead state or unused imports remain. ' +
          'Distinguish implementation-quality verification from behavioral acceptance: state, for each ' +
          'acceptance obligation, whether available evidence establishes it, or NOT ESTABLISHED. ' +
          'Build/lint/test/diff results support implementation conclusions only.',
      },
      {
        role: 'reviewer',
        agentId: 'vestara-reviewer',
        instruction:
          'Review the Agent Control restructure diff and verification results. Approve or request ' +
          'revisions. Confirm the refactor preserved behavior (identical rendered output and props) and ' +
          'did not creep scope into new features. Review against the acceptance boundary, not only diff ' +
          'correctness. Flag any change that weakens or substitutes the acceptance object.',
      },
    ],
  },
  'activity-room-premium-redesign': {
    id: 'activity-room-premium-redesign',
    name: 'Activity Room Premium Redesign',
    description:
      'Reusable Visual Target proving case: redesign the Activity Room (apps/workspace/src/pages/activity/) ' +
      'toward the premium operations-room wireframe contract (context → plan → develop → review → verify → ' +
      'visual review → observe → complete), preserving all protected behaviors. Model policy: plan, develop, ' +
      'review, and verify stages require strong coding/reasoning models (DeepSeek V4 Flash / MiMo V2.5 via the ' +
      'OpenCode runtime), not the free tier.',
    stages: [
      {
        role: 'context',
        agentId: 'vestara-context',
        instruction:
          'Visual Analyst (CONTEXT phase). Inspect the existing Activity Room implementation ' +
          '(apps/workspace/src/pages/activity/, apps/workspace/src/hooks/useActivityStream.ts, ' +
          'apps/workspace/src/lib/activity.ts, apps/api/src/routes/activity-room.ts, ' +
          'packages/activity-room/src/) and produce a machine-readable VisualDesignSpec covering: ' +
          'layout regions with target dimensions (participant rail 230–260px, inspector 300–340px, ' +
          'workflow browser ~280px, Live Now 48–64px), component inventory, typography/spacing/surface ' +
          'rules, semantic colors (gold=identity/selection, blue=execution, cyan=tools/files, ' +
          'purple=planning, green=success/verification, amber=review/waiting, red=failure), responsive ' +
          'rules (1440px+ three columns; 1024–1439px inspector drawer; 768–1023px participants drawer; ' +
          '<768px single column with sheets and sticky composer), and the protected behaviors that must ' +
          'never change. Do NOT propose implementation details; the spec is the contract.',
      },
      {
        role: 'planner',
        agentId: 'vestara-planner',
        instruction:
          'UX Architect (PLAN phase). Map the VisualDesignSpec onto the existing component tree. ' +
          'Decompose the redesign into independently verifiable slices: AR-01 workflow-scoped data ' +
          'architecture, AR-02 Workflow Browser (lightweight summaries only, never full activity per ' +
          'workflow), AR-03 selected workflow header + lifecycle, AR-04 health/attention strip, AR-05 ' +
          'participant projections (one current projection per agent, never stacked messages), AR-06 ' +
          'Live Now bar (48–64px, no raw transcripts), AR-07 operational activity projection (never raw ' +
          'agent reasoning inline), AR-08 filtering/date/sorting that change server query scope, AR-09 ' +
          'event inspector (contextual, collapsible), AR-10 functional composer + message receipts ' +
          '(broadcast observed vs @mention addressed), AR-11 responsive behavior, AR-12 performance ' +
          'verification, AR-13 visual convergence, AR-14 final integrated verification. For each slice: ' +
          'scope, files, protected behaviors, and acceptance criteria. Declare the acceptance boundary ' +
          '(observable obligations + material uncertainties).',
      },
      {
        role: 'developer',
        agentId: 'vestara-developer',
        instruction:
          'Implement the Activity Room Premium Redesign in bounded slices per the plan, in order. ' +
          'PROTECTED BEHAVIORS (never regress): compose box + broadcast visibility to participating ' +
          'agents, @agent routing, message/observation receipts, workflow filtering, live telemetry, ' +
          'pause/resume, visual audit, and stream performance (bounded latest window, 400-char ' +
          'projections, lazy detail hydration, coalesced live updates, cursor pagination, one shared ' +
          'subscription). Work in small increments; after each slice run the workspace build, the app ' +
          'typecheck (pnpm build does NOT typecheck apps/workspace — run npx tsc --noEmit -p ' +
          'apps/workspace/tsconfig.json), lint, and affected tests, and record change evidence. Never ' +
          'implement the whole wireframe in one invocation; the plan defines the slice boundaries.',
      },
      {
        role: 'verifier',
        agentId: 'vestara-verifier',
        instruction:
          'Verify the Activity Room redesign (VERIFY phase): TypeScript (app typecheck via npx tsc ' +
          '--noEmit -p apps/workspace/tsconfig.json, which pnpm build does not cover), tests, E2E, ' +
          'messaging/receipts behavior, stream performance (bounded windows, projections, lazy details, ' +
          'coalescing, pagination), and screenshot/visual comparison against the target. For each ' +
          'acceptance obligation state ESTABLISHED or NOT ESTABLISHED with evidence. Build/lint/test ' +
          'results support implementation conclusions only; they do not by themselves establish product ' +
          'acceptance.',
      },
      {
        role: 'reviewer',
        agentId: 'vestara-reviewer',
        instruction:
          'Review the redesign (REVIEW + VISUAL REVIEW phases) against: the plan slice boundaries ' +
          '(catch scope drift), the UX contract (hierarchy: workflow header → attention strip → ' +
          'participant rail → live now → operational timeline → inspector → raw → composer → browser), ' +
          'the architecture, the protected behaviors, and the visual target (reference image vs actual ' +
          'application screenshot at the same viewport). Produce actionable findings in VISUAL-NNN ' +
          'format with specific discrepancies (dimensions, spacing, color semantics, component density). ' +
          'Approve or request revisions. A claim that work is complete is not evidence.',
      },
      {
        role: 'developer',
        agentId: 'vestara-developer',
        instruction:
          'Remediation pass: address each reviewer finding from the previous review (plan/UX/visual), ' +
          're-run the workspace build, app typecheck, lint, and affected tests after each fix, and ' +
          'record change evidence. Do not introduce new scope while remediating.',
      },
      {
        role: 'reviewer',
        agentId: 'vestara-reviewer',
        instruction:
          'Observer (OBSERVE + COMPLETE phases). Evaluate the whole workflow: are findings converging ' +
          'across passes, are failures repeated, are agents contradicting each other, is evidence ' +
          'sufficient, is there scope drift? If the loop is not converging (no meaningful improvement ' +
          'between passes), escalate to a human — do not keep polishing. If the evidence policy is ' +
          'satisfied (protected behaviors verified, tests pass, visual target reached or explicitly ' +
          'deferred with rationale), confirm completion for human approval. Completion is NEVER ' +
          'established by a developer assertion; it requires evidence.',
      },
    ],
  },
};

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

  /**
   * Resolve the stage plan for a named workflow template. Unknown or missing
   * templates fall back to the standard `default` pipeline so callers can
   * request a template defensively.
   */
  stagesForTemplate(
    templateId: MultiAgentWorkflowTemplateId | undefined,
    goal: string,
  ): readonly MultiAgentStageSpec[] {
    const template = MULTI_AGENT_WORKFLOW_TEMPLATES[templateId ?? 'default'] ?? MULTI_AGENT_WORKFLOW_TEMPLATES.default;
    return template.stages.map((stage) => ({ ...stage, instruction: `${stage.instruction}\n\nGoal: ${goal}` }));
  }

  get harness(): AgentHarnessRuntime {
    return this.session.harness;
  }

  get environment(): AgentEnvironment {
    return this.session.environment;
  }

  /** M7: Access the runtime session registry for binding queries. */
  get runtimeSessionRegistry(): RuntimeSessionRegistry | undefined {
    return this.options.runtimeSessionRegistry;
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

    // M7: Acquire a runtime session binding for this workflow run.
    // This establishes the continuity key (workflowId + directory) and creates
    // or reuses a single OpenCode session for all stages in this workflow.
    let runtimeSessionBinding: RuntimeSessionBinding | undefined;
    if (this.runtimeSessionRegistry) {
      try {
        const acquisition = await this.runtimeSessionRegistry.acquire({
          workflowRunId: workflowId as WorkflowRunId,
          repositoryBindingId: `repo-${this.environment.id}` as any,
          directory: this.environment.workspaceRoot,
          continuityPolicy: 'SHARED_WORKFLOW',
          creationReason: 'workflow-start',
          workspaceId: this.session.harness['options']?.store?.toString() ?? 'default',
        });
        runtimeSessionBinding = acquisition.binding;
      } catch (error) {
        // M7.1: If acquisition fails, log and continue with ephemeral behavior.
        // The workflow can still execute with per-turn session creation.
        console.error('[M7] RuntimeSessionRegistry acquisition failed:', error);
      }
    }

    void this.executeChain(
      workflowId,
      input.stages,
      stages.map((stage) => stage.threadId),
      runtimeSessionBinding,
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
    runtimeSessionBinding?: RuntimeSessionBinding,
  ): Promise<void> {
    let previousOutput: string | undefined;
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index];
      const threadId = threadIds[index] as TaskThreadId;
      const result = await this.runStage(spec, threadId, previousOutput, runtimeSessionBinding);
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
    runtimeSessionBinding?: RuntimeSessionBinding,
  ): Promise<HarnessRunResult> {
    const instruction = this.instructionForStage(spec, threadId, previousOutput);
    // M7: If we have a binding with a physical session, pass it through the
    // environment so the provider can reuse the existing OpenCode session.
    const environment = runtimeSessionBinding?.physicalSessionId
      ? { ...this.environment, runtimeSessionId: runtimeSessionBinding.runtimeSessionId }
      : this.environment;
    return this.session.harness.run({
      threadId,
      instruction,
      agentId: spec.agentId,
      environment,
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

  /**
   * Wake an idle workflow toward the addressed agent. Safe: it only resumes the
   * chain when no sibling thread is actively running, so it never interrupts a
   * turn in progress. Used by @mention scheduling (a human @mention while the
   * workflow is waiting should let the addressed agent begin/continue).
   */
  async resumeIfIdle(workflowId: string): Promise<{ resumed: boolean; threadId: string | null }> {
    const runningStates = new Set(['preparing', 'reasoning', 'awaiting-tool', 'executing-tool', 'verifying']);
    for (const sibling of this.siblingThreads(workflowId)) {
      const state = this.session.harness.snapshot(sibling.id as TaskThreadId).state;
      if (runningStates.has(state)) return { resumed: false, threadId: null };
    }
    const threadId = await this.resume(workflowId);
    return { resumed: threadId !== null, threadId };
  }
}
