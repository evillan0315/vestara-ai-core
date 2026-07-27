import type { AgentRuntime } from './agent-runtime';
import type { AgentStorage } from './agent-storage';
import type { AgentDefinition, ExecutionSession } from './types';
import type { WorkspaceSession } from './workspace-session';

type StepDef = { role: string; task: string };

interface WorkflowDef {
  label: string;
  parallelGroups: StepDef[][];
}

const WORKFLOWS: Record<string, WorkflowDef> = {
  feature: {
    label: 'Feature Development',
    parallelGroups: [
      [{ role: 'architect', task: 'Analyze requirements and create architecture plan' }],
      [{ role: 'developer', task: 'Implement the planned changes' }],
      [
        { role: 'tester', task: 'Generate and run tests for the implementation' },
        { role: 'reviewer', task: 'Review the implementation for quality and correctness' },
      ],
    ],
  },
  analyze: {
    label: 'Repository Analysis',
    parallelGroups: [
      [
        { role: 'analyst', task: 'Analyze repository structure and dependencies' },
        { role: 'security-agent', task: 'Scan for security vulnerabilities' },
        { role: 'performance-agent', task: 'Benchmark and identify performance hotspots' },
      ],
    ],
  },
  document: {
    label: 'Documentation Generation',
    parallelGroups: [
      [
        { role: 'documentation-agent', task: 'Generate API documentation from source' },
        { role: 'documenter', task: 'Create user-facing documentation and guides' },
      ],
    ],
  },
  refactor: {
    label: 'Code Refactoring',
    parallelGroups: [
      [{ role: 'analyst', task: 'Identify refactoring opportunities and technical debt' }],
      [{ role: 'refactoring-agent', task: 'Apply refactoring improvements' }],
      [{ role: 'tester', task: 'Verify no regressions after refactoring' }],
    ],
  },
  release: {
    label: 'Release Preparation',
    parallelGroups: [
      [
        { role: 'verifier', task: 'Run full verification suite' },
        { role: 'documentation-agent', task: 'Generate changelog and release notes' },
      ],
      [{ role: 'release-agent', task: 'Prepare release package and version bump' }],
    ],
  },
};

function countSteps(def: WorkflowDef): number {
  return def.parallelGroups.reduce((sum, g) => sum + g.length, 0);
}

async function runAgentStep(
  storage: AgentStorage,
  runtime: AgentRuntime,
  step: StepDef,
  goal: string,
  workflowId: string,
  session: WorkspaceSession,
  agents: AgentDefinition[],
): Promise<{ status: string; log: string; outputArtifacts: string[] }> {
  const agent = agents.find((a) => a.role === step.role && a.status === 'active');
  if (!agent) return { status: 'skipped', log: `[${step.role}] No active agent found`, outputArtifacts: [] };

  try {
    const result = await runtime.run(agent.id, `${step.task} for: ${goal}`, session);

    await storage.saveMemory({
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      agentId: agent.id,
      type: 'execution',
      summary: `Completed: ${step.task}`,
      detail: result.message,
      tags: [workflowId, step.role, result.execution.status],
      confidence: result.execution.status === 'completed' ? 0.9 : 0.3,
      createdAt: new Date().toISOString(),
    });

    return {
      status: result.execution.status,
      log: `[${step.role}] ${result.message}`,
      outputArtifacts: result.execution.outputArtifacts ?? [],
    };
  } catch (err: any) {
    return { status: 'failed', log: `[${step.role}] Error: ${err.message}`, outputArtifacts: [] };
  }
}

export class SessionOrchestrator {
  private storage: AgentStorage;
  private runtime: AgentRuntime;
  private onSessionComplete?: (session: ExecutionSession) => void;

  constructor(opts: {
    storage: AgentStorage;
    runtime: AgentRuntime;
    onComplete?: (session: ExecutionSession) => void;
  }) {
    this.storage = opts.storage;
    this.runtime = opts.runtime;
    this.onSessionComplete = opts.onComplete;
  }

  setOnComplete(cb: (session: ExecutionSession) => void): void {
    this.onSessionComplete = cb;
  }

  listWorkflows(): Array<{ id: string; label: string; steps: number }> {
    return Object.entries(WORKFLOWS).map(([id, w]) => ({ id, label: w.label, steps: countSteps(w) }));
  }

  async startSession(goal: string, workflowId: string, session: WorkspaceSession): Promise<ExecutionSession> {
    const workflow = WORKFLOWS[workflowId];
    if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);

    const agents = await this.storage.listAgents();
    const now = new Date().toISOString();

    const exSession: ExecutionSession = {
      id: `exs-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      goal,
      workflowId,
      assignedAgentIds: [],
      planIds: [],
      changeSetIds: [],
      verificationIds: [],
      logs: [`Session started at ${now}`],
      timeline: [],
      approvals: [],
      metrics: { duration: 0, totalSteps: countSteps(workflow), completedSteps: 0, artifactCount: 0 },
      status: 'queued',
      createdAt: now,
    };

    await this.storage.saveExecutionSession(exSession);
    await this.storage.updateExecutionSessionStatus(exSession.id, 'running');

    const timeline: ExecutionSession['timeline'] = [];
    const logs: string[] = [...exSession.logs];
    const metrics = { ...exSession.metrics };
    const planIds: string[] = [];
    const changeSetIds: string[] = [];
    const verificationIds: string[] = [];
    const allAssignedIds: string[] = [];

    for (const group of workflow.parallelGroups) {
      // Run all steps in this group in parallel
      const results = await Promise.all(
        group.map(async (step) => {
          const agent = agents.find((a) => a.role === step.role && a.status === 'active');
          if (agent && !allAssignedIds.includes(agent.id)) allAssignedIds.push(agent.id);

          timeline.push({
            step: step.role,
            agentId: agent?.id ?? 'none',
            status: 'running',
            timestamp: new Date().toISOString(),
          });

          const result = await runAgentStep(this.storage, this.runtime, step, goal, workflowId, session, agents);

          // Update timeline entry
          const idx = timeline.findIndex((t) => t.step === step.role && t.status === 'running');
          if (idx >= 0)
            timeline[idx] = {
              step: step.role,
              agentId: agent?.id ?? 'none',
              status: result.status,
              timestamp: new Date().toISOString(),
            };

          if (result.status === 'completed') metrics.completedSteps++;
          logs.push(result.log);

          for (const art of result.outputArtifacts) {
            metrics.artifactCount++;
            if (art.includes('plan')) planIds.push(art);
            else if (art.includes('cs-') || art.includes('changeset')) changeSetIds.push(art);
            else if (art.includes('vr-') || art.includes('verification')) verificationIds.push(art);
          }

          return result;
        }),
      );

      await this.storage.updateExecutionSessionTimeline(exSession.id, timeline);

      // If all steps in a sequential group completed, continue; else fail
      if (results.some((r) => r.status === 'failed')) {
        logs.push(`[group] Parallel group completed with failures`);
      }
    }

    const allCompleted = timeline.every((t) => t.status === 'completed');
    const anyFailed = timeline.some((t) => t.status === 'failed');
    const finalStatus: ExecutionSession['status'] = allCompleted ? 'completed' : anyFailed ? 'failed' : 'completed';
    metrics.duration = Date.now() - new Date(exSession.createdAt).getTime();

    const resultSession: ExecutionSession = {
      ...exSession,
      assignedAgentIds: allAssignedIds,
      planIds,
      changeSetIds,
      verificationIds,
      timeline,
      logs,
      metrics,
      status: finalStatus,
    };
    await this.storage.saveExecutionSession(resultSession);
    this.onSessionComplete?.(resultSession);
    return resultSession;
  }

  async runBackground(agentId: string, task: string, session: WorkspaceSession): Promise<void> {
    const agent = await this.storage.getAgent(agentId);
    if (!agent) return;

    try {
      const result = await this.runtime.run(agentId, task, session);

      await this.storage.saveMemory({
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        agentId,
        type: 'observation',
        summary: `Background: ${task}`,
        detail: result.message,
        tags: ['background', agent.role, result.execution.status],
        confidence: result.execution.status === 'completed' ? 0.7 : 0.2,
        createdAt: new Date().toISOString(),
      });
    } catch {}
  }

  async runBackgroundServices(session: WorkspaceSession): Promise<void> {
    const agents = await this.storage.listAgents();
    const bgRoles = ['analyst', 'security-agent', 'performance-agent', 'documentation-agent'];

    const bgAgents = agents.filter((a) => bgRoles.includes(a.role) && a.status === 'active');
    if (bgAgents.length === 0) return;

    const bgTasks: Record<string, string> = {
      analyst: 'Scan repository for code quality metrics and dependency updates',
      'security-agent': 'Check for known vulnerabilities in dependencies',
      'performance-agent': 'Measure build times and identify slow operations',
      'documentation-agent': 'Index any new documentation or README changes',
    };

    await Promise.all(
      bgAgents.map((a) => this.runBackground(a.id, bgTasks[a.role] ?? 'Performing routine analysis', session)),
    );
  }
}

export { WORKFLOWS };
