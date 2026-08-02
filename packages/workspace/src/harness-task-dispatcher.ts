/**
 * HarnessTaskDispatcher — adapts the workflow orchestrator's TaskDispatcher
 * contract onto the durable agent harness execution path.
 *
 * Each orchestrated task runs as its own durable harness thread tagged with
 * the shared `workflowId` (+ task/plan ids) in thread metadata, so the
 * cross-thread projection (`projectWorkflowAcrossThreads`) merges sibling task
 * threads into one canonical multi-agent workflow. This is the "execution
 * adapter" that feeds the WorkflowOrchestrator: the orchestrator owns project/
 * plan/task state; agents execute through the harness.
 *
 * Architecture Traceability:
 *   ADR-004 / ADR-118 — Multi-Agent Workflow Orchestration
 *   PCS-025 §3.4, §5 (capability-based task → agent assignment)
 */

import {
  type CapabilityResolver,
  DefaultCapabilityCatalog,
  DefaultCapabilityResolver,
  getBuiltinDefinitions,
  getBuiltinRelationships,
} from '@vestara/capabilities';
import type { AgentEnvironment, TaskThreadId } from '@vestara/types';
import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  WorkflowTask,
} from '@vestara/workflow-orchestrator';
import type { HarnessSession } from './harness-session';
import type { ChangeProjectorLike } from './multi-agent-workflow';
import type { AgentDefinition } from './types';

/** Narrow structural view of the agent source the dispatcher needs (testable). */
export interface AgentSource {
  listAgents(): Promise<Array<Pick<AgentDefinition, 'id' | 'role' | 'status' | 'capabilities'>>>;
}

/** Narrow structural view of the harness the dispatcher needs (testable). */
export interface HarnessThreadRunner {
  createThread(input: {
    taskId: string;
    title: string;
    environment: AgentEnvironment;
    metadata: Readonly<Record<string, unknown>>;
  }): { readonly id: string };
  run(input: {
    threadId: string;
    instruction: string;
    agentId: string;
    environment: AgentEnvironment;
  }): Promise<{ turn: { readonly state: string; readonly outcome?: { readonly summary?: string } } }>;
}

/**
 * Build the default capability resolver used for task → agent assignment: the
 * builtin taxonomy (namespaced capabilities with implications/wildcards) backed
 * by the generic catalog + resolver. Exact flat names (e.g. `code-generation`)
 * still resolve directly; namespaced ones (`filesystem.write`) match wildcard
 * providers (`filesystem.*`).
 */
export function createDefaultAssignmentResolver(): CapabilityResolver {
  const catalog = new DefaultCapabilityCatalog();
  for (const definition of getBuiltinDefinitions()) {
    catalog.register(definition);
    const relationships = getBuiltinRelationships(definition.id);
    if (relationships) catalog.registerRelationships(definition.id, relationships);
  }
  return new DefaultCapabilityResolver(catalog);
}

export interface HarnessTaskDispatcherOptions {
  readonly runner: HarnessThreadRunner;
  /** Optional — associates each task thread with an ExecutionSession. */
  readonly session?: HarnessSession;
  readonly storage?: AgentSource;
  readonly environment: AgentEnvironment;
  /** Captures/projects filesystem + git diffs per task thread. */
  readonly changeProjector?: ChangeProjectorLike;
  /** Shared workflow id stamped into every task thread; defaults to the project id. */
  readonly workflowId?: string;
  /** Capability resolver for task → agent assignment; defaults to the builtin taxonomy. */
  readonly resolver?: CapabilityResolver;
}

export class HarnessTaskDispatcher implements TaskDispatcher {
  private readonly runner: HarnessThreadRunner;
  private readonly session?: HarnessSession;
  private readonly storage?: AgentSource;
  private readonly environment: AgentEnvironment;
  private readonly changeProjector?: ChangeProjectorLike;
  private readonly workflowId?: string;
  private readonly resolver: CapabilityResolver;

  constructor(options: HarnessTaskDispatcherOptions) {
    this.runner = options.runner;
    this.session = options.session;
    this.storage = options.storage;
    this.environment = options.environment;
    this.changeProjector = options.changeProjector;
    this.workflowId = options.workflowId;
    this.resolver = options.resolver ?? createDefaultAssignmentResolver();
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    const agentId = await this.resolveAgent(task);
    const threadId = task.id;
    const workflowId = this.workflowId ?? `wf:${project.id}`;
    const thread = this.runner.createThread({
      taskId: threadId,
      title: `${agentId}: ${task.summary}`,
      environment: this.environment,
      metadata: {
        agentId,
        workflowId,
        taskId: threadId,
        planId: task.planId,
        runSource: 'workflow-orchestrator',
      },
    });
    await this.session?.createForRun({ threadId: thread.id, goal: task.summary, agentId }).catch(() => null);
    void this.changeProjector
      ?.captureBaseline({ threadId: thread.id as TaskThreadId, taskId: threadId, agentId })
      .catch(() => {});
    const result = await this.runner.run({
      threadId: thread.id,
      instruction: task.description || task.summary,
      agentId,
      environment: this.environment,
    });
    await this.session?.syncFromReplay(thread.id).catch(() => null);
    void this.changeProjector
      ?.projectChanges({ threadId: thread.id as TaskThreadId, taskId: threadId, agentId })
      .catch(() => {});
    const state = result.turn.state;
    if (state === 'completed') {
      return { status: 'completed', agentId, output: result.turn.outcome?.summary };
    }
    return { status: 'failed', agentId, error: `task turn ended with state "${state}"` };
  }

  /** Capability-based task → agent assignment (PCS-025 §5). */
  private async resolveAgent(task: WorkflowTask): Promise<string> {
    if (!this.storage) return 'developer';
    const agents = await this.storage.listAgents().catch(() => []);
    const active = agents.filter((agent) => agent.status === 'active');
    if (active.length === 0) return 'developer';

    const required = task.requiredCapabilities;
    if (required.length === 0) {
      const developer = active.find((agent) => agent.role === 'developer');
      return developer?.id ?? active[0].id;
    }

    let best: { id: string; score: number; role: string } | undefined;
    const requiredCopy = [...required];
    for (const agent of active) {
      let score = 0;
      try {
        score = this.resolver.resolve(requiredCopy, [...agent.capabilities]).score;
      } catch {
        score = required.every((capability) => agent.capabilities.includes(capability)) ? 1 : 0;
      }
      const prefersDeveloper = score === best?.score && agent.role === 'developer' && best.role !== 'developer';
      if (!best || score > best.score || prefersDeveloper) best = { id: agent.id, score, role: agent.role };
    }

    if (best && best.score > 0) return best.id;
    const developer = active.find((agent) => agent.role === 'developer');
    return developer?.id ?? active[0].id;
  }
}
