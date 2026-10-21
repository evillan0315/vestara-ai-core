/**
 * E2E — Workflow orchestration agents can execute shell/bash commands.
 *
 * Regression cover for the agent-frontmatter defect that denied the shell
 * tool to the Developer / Reviewer / Verifier during workflow orchestration:
 *
 *   The generated `.opencode/agents/<agent>.md` files carried a provenance
 *   comment AHEAD of the YAML frontmatter. Runtimes parse frontmatter only
 *   when the file starts with `---`, so the whole file — frontmatter included —
 *   was read as prompt text and the agent's governed grants were silently
 *   discarded. Every agent then inherited the global permission block
 *   (`bash: ask`), the OpenCode runtime gated the tool call behind
 *   `permission.asked`, and the workflow runtime never answered it: the shell
 *   call never ran and the turn stalled on the unanswered approval.
 *
 * Two layers are covered:
 *
 *   1. Permission resolution — the live runtime must resolve `bash → allow`
 *      for the workflow agents (developer / reviewer / verifier), and must
 *      actually parse the generated frontmatter (description + mode).
 *   2. Execution — the real orchestration path
 *      (WorkflowOrchestrator → HarnessTaskDispatcher → AgentHarnessRuntime →
 *      OpenCodeRuntimeProvider → live OpenCode server) must run a shell
 *      command. Proof is the file the command writes, not the turn status.
 *
 * Live-server gated: skipped unless OPENCODE_SERVER_PASSWORD is set.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentHarnessRuntime } from '@vestara/agent-harness';
import { InProcessEventBus } from '@vestara/event-bus';
import { OpenCodeHttpClient, resolveOpenCodeConfig } from '@vestara/opencode-runtime';
import { OpenCodeRuntimeProvider } from '@vestara/provider-opencode';
import { migrate } from '@vestara/sqlite-migrations';
import { FileThreadStore } from '@vestara/thread-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment } from '@vestara/types';
import type {
  OrchestratedProject,
  OrchestrationEvent,
  OrchestrationEventSink,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '@vestara/workflow-orchestrator';
import {
  ArtifactStore,
  FileLockRegistry,
  PlanStore,
  ProjectStore,
  TaskStore,
  WorkflowOrchestrator,
} from '@vestara/workflow-orchestrator';
import { AgentStorage, HarnessSession, HarnessTaskDispatcher, PLANS_MANIFEST } from '@vestara/workspace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_SERVER = Boolean(process.env.OPENCODE_SERVER_PASSWORD);

/** Agents whose shell access the workflow depends on. */
const SHELL_AGENTS = [
  { runtimeAgent: 'vestara-developer', role: 'developer', mode: 'primary' },
  { runtimeAgent: 'vestara-reviewer', role: 'reviewer', mode: 'subagent' },
  { runtimeAgent: 'vestara-verifier', role: 'verifier', mode: 'subagent' },
] as const;

/** Repository root — the directory that owns `.opencode/agents/*.md`. */
function findRepositoryRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.opencode', 'agents')) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repository root (owner of .opencode/agents) not found');
}

async function openInMemoryDb(): Promise<import('sql.js').Database> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SQL.Database();
}

/** In-memory orchestration event sink. */
class CollectingEventSink implements OrchestrationEventSink {
  readonly events: OrchestrationEvent[] = [];
  append(event: OrchestrationEvent): void {
    this.events.push(event);
  }
}

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('E2E — workflow orchestration shell/bash access', () => {
  if (!HAS_SERVER) {
    it.skip('skipped: OPENCODE_SERVER_PASSWORD not set', () => {});
    return;
  }

  let orchestrator: WorkflowOrchestrator;
  let store: FileThreadStore;
  let markerPath: string;
  let repositoryDir: string;

  beforeAll(async () => {
    repositoryDir = findRepositoryRoot();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-wfo-bash-'));
    directories.push(directory);
    const workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    markerPath = path.join(directory, 'bash-marker.txt');

    const environment: AgentEnvironment = {
      id: 'environment-local',
      kind: 'local',
      workspaceRoot,
      networkPolicy: 'allow',
      filesystemPolicy: 'workspace-write',
      processPolicy: 'restricted',
    } as AgentEnvironment;

    store = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const eventBus = new InProcessEventBus();
    const tools = new ToolRuntime();

    const db = await openInMemoryDb();
    migrate(db, PLANS_MANIFEST, {});
    const agents = new AgentStorage(db);

    // The provider directory MUST be the repository root: that is where the
    // runtime resolves `.opencode/agents/<agent>.md`, i.e. where the agent's
    // governed permission grants come from.
    const provider = new OpenCodeRuntimeProvider({
      directory: repositoryDir,
      workspaceId: 'vestara-e2e',
      streamIdleTimeoutMs: 180_000,
      streamMaxDurationMs: 600_000,
    });
    await provider.initialize({});

    const harness = new AgentHarnessRuntime({
      store,
      provider,
      model: 'opencode-runtime',
      tools,
      context: {
        async assemble({ thread }) {
          return `Task ${thread.taskId}`;
        },
      },
      verifier: {
        async verify() {
          return { status: 'passed', checks: [], evidence: [], uncoveredRisks: [], confidence: 0.95 };
        },
      },
      eventBus,
      // Mirrors the production resolver (apps/api/src/workspace-context.ts):
      // the stored agent's own provider/model/runtimeAgent wins, so the
      // orchestrated turn runs as the agent's native twin.
      resolveAgentExecution: async ({ agentId }) => {
        const stored = await agents.listAgents();
        const agent = stored.find(
          (candidate) => candidate.id === agentId || candidate.runtimeAgent === agentId || candidate.role === agentId,
        );
        if (!agent?.model) return undefined;
        return {
          providerId: agent.provider || undefined,
          modelId: agent.model,
          runtimeAgent: agent.runtimeAgent || undefined,
        };
      },
    });

    const harnessSession = new HarnessSession({ harness, storage: agents, environment });
    const realDispatcher = new HarnessTaskDispatcher({
      runner: harness,
      session: harnessSession,
      storage: agents,
      environment,
    });

    // The task-execution stage runs the REAL dispatcher (real harness, real
    // provider, real agent). The review/test stages are stubbed to keep the
    // run deterministic: a live reviewer may legitimately request changes,
    // which would re-dispatch the task and make the assertion depend on model
    // output rather than on the shell capability under test.
    const dispatcher: TaskDispatcher = {
      dispatch: (task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> =>
        realDispatcher.dispatch(task, project),
      review: async (): Promise<TaskReviewResult> => ({
        decision: 'approved',
        agentId: 'agent-reviewer',
        feedback: 'stubbed for determinism',
      }),
      test: async (): Promise<TaskTestResult> => ({
        status: 'passed',
        agentId: 'agent-verifier',
        report: { stubbed: true },
      }),
    };

    orchestrator = new WorkflowOrchestrator({
      projects: new ProjectStore(db),
      plans: new PlanStore(db),
      tasks: new TaskStore(db),
      artifacts: new ArtifactStore(db),
      locks: new FileLockRegistry(db),
      events: new CollectingEventSink(),
      dispatcher,
    });
  });

  afterAll(async () => {
    store.close();
  });

  it('resolves bash=allow for the workflow agents and parses their generated frontmatter', async () => {
    const client = new OpenCodeHttpClient(resolveOpenCodeConfig({}));
    const agents = await client.listAgents();

    for (const expected of SHELL_AGENTS) {
      const agent = agents.find((candidate) => candidate.name === expected.runtimeAgent);
      expect(agent, `runtime agent ${expected.runtimeAgent} is not registered`).toBeDefined();
      if (!agent) continue;

      // Frontmatter parsed: without it the runtime keeps the whole file as
      // prompt text and drops description/mode/permission.
      expect(agent.description, `${expected.runtimeAgent} description`).toBeTruthy();
      expect(agent.mode, `${expected.runtimeAgent} mode`).toBe(expected.mode);

      // The effective bash decision is the LAST matching rule — the agent's own
      // grant is appended after the global block.
      const bashRules = (agent.permission ?? []).filter((rule) => rule.permission === 'bash');
      expect(bashRules.length, `${expected.runtimeAgent} bash rules`).toBeGreaterThan(0);
      expect(bashRules.at(-1)?.action, `${expected.runtimeAgent} effective bash decision`).toBe('allow');
    }
  });

  it('runs a shell command through the developer agent during task execution', { timeout: 300_000 }, async () => {
    const project = await orchestrator.createProject({
      name: 'Shell access',
      goal: 'Prove the workflow developer agent can run a shell command',
      repoPath: repositoryDir,
      workspaceId: 'ws-e2e',
    });
    await orchestrator.startProject(project.id);
    await orchestrator.completeAnalysis(project.id, {
      analystId: 'agent-context',
      report: { summary: 'repo scanned' },
    });
    await orchestrator.generatePlan(project.id, {
      plannerId: 'agent-planner',
      title: 'Plan',
      goal: 'Prove the workflow developer agent can run a shell command',
      tasks: [
        {
          planId: '',
          summary: 'Run a shell command',
          description:
            `Run this exact shell command with your shell/bash tool and report its output: ` +
            `echo VESTARA_WFO_BASH_OK > ${markerPath}`,
          files: [],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
      ],
    });
    await orchestrator.reviewArchitecture(project.id, { architectId: 'agent-planner', status: 'approved' });
    await orchestrator.approveProject(project.id, { approvalId: 'approval-1' });

    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].status).toBe('completed');

    // The decisive assertion: the shell command really ran inside the
    // orchestrated task. A gated/denied tool call leaves no file behind.
    expect(fs.existsSync(markerPath)).toBe(true);
    expect(fs.readFileSync(markerPath, 'utf8').trim()).toBe('VESTARA_WFO_BASH_OK');
  });
});
