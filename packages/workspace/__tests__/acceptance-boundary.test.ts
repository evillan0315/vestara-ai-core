import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentHarnessRuntime, type HarnessContextAssembler, type HarnessVerifier } from '@vestara/agent-harness';
import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderHealthStatus,
  StreamChunk,
} from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, AgentEnvironmentId, HarnessVerificationResult } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseAcceptanceDeclaration,
  refineAcceptanceBoundary,
  renderAcceptanceBoundary,
  seedAcceptanceBoundary,
} from '../src/acceptance-boundary.js';
import { type MultiAgentStageSpec, MultiAgentWorkflowOrchestrator } from '../src/multi-agent-workflow.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const model: AIModel = {
  id: 'model-test',
  provider: 'test',
  name: 'Test',
  contextWindow: 32_000,
  maxOutput: 4_000,
  capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
  status: 'available',
};

function provider(complete: (request: CompletionRequest) => Promise<CompletionResponse>): AIProvider {
  return {
    id: 'provider-test',
    name: 'Test Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat', 'function-calling'] },
    async initialize() {},
    complete,
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {},
    async healthCheck(): Promise<ProviderHealthStatus> {
      return {
        status: 'healthy',
        providerId: 'provider-test',
        modelCount: 1,
        latency: 1,
        lastHeartbeat: new Date().toISOString(),
      };
    },
    async listModels() {
      return [model];
    },
  };
}

function response(content: string): CompletionResponse {
  return {
    id: `response-${content.length}`,
    model: model.id,
    provider: 'provider-test',
    content,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latency: 1,
  };
}

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-acceptance-'));
  directories.push(directory);
  const workspaceRoot = path.join(directory, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const environment: AgentEnvironment = {
    id: 'environment-local' as AgentEnvironmentId,
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  return { directory, workspaceRoot, environment, dbPath: path.join(directory, 'threads.db') };
}

const context: HarnessContextAssembler = {
  async assemble({ thread }) {
    return `Task ${thread.taskId}; follow repository instructions.`;
  },
};

const passedVerification: HarnessVerificationResult = {
  status: 'passed',
  checks: [{ id: 'check-1', name: 'Focused test', status: 'passed', summary: 'Passed' }],
  evidence: [{ id: 'evidence-1', kind: 'test', summary: 'Focused test passed', metadata: {} }],
  uncoveredRisks: [],
  confidence: 0.95,
};

const verifier: HarnessVerifier = {
  async verify() {
    return passedVerification;
  },
};

async function createOrchestrator(
  routeResponses: (instruction: string) => string,
): Promise<{ orchestrator: MultiAgentWorkflowOrchestrator; harness: AgentHarnessRuntime; workflowId: string }> {
  const { dbPath, workspaceRoot, environment } = setup();
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'foundation');
  const store = await FileThreadStore.open(dbPath);
  const harness = new AgentHarnessRuntime({
    store,
    provider: provider(async (request) =>
      response(routeResponses(request.messages[request.messages.length - 1].content)),
    ),
    model: model.id,
    tools: new ToolRuntime(),
    context,
    verifier,
  });
  const session = {
    harness,
    environment,
    async createForRun() {
      return { sessionId: 'session', threadId: '', agentId: '', runId: '', goal: '' };
    },
    async syncFromReplay() {
      return null;
    },
  } as never;
  const orchestrator = new MultiAgentWorkflowOrchestrator({ session });
  return { orchestrator, harness, workflowId: `wf-test-${Date.now()}-${Math.random().toString(16).slice(2)}` };
}

async function runWorkflow(
  orchestrator: MultiAgentWorkflowOrchestrator,
  harness: AgentHarnessRuntime,
  workflowId: string,
) {
  const stages = orchestrator.stagesFromGoal('The generated configuration must remain active after process restart.');
  await orchestrator.start({
    goal: 'The generated configuration must remain active after process restart.',
    stages,
    workflowId,
  });
  const deadline = Date.now() + 15_000;
  for (;;) {
    const threads = harness.listThreads().filter((thread) => thread.metadata?.workflowId === workflowId);
    if (threads.length >= stages.length && threads.every((thread) => thread.status === 'completed')) break;
    if (Date.now() > deadline) throw new Error('workflow did not complete in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function userMessageText(harness: AgentHarnessRuntime, threadId: string): string {
  const replay = harness.replay(threadId as never);
  const item = replay.items.find((candidate) => candidate.kind === 'user-message');
  return String((item?.payload as { content?: unknown } | undefined)?.content ?? '');
}

const PLANNER_DECLARATION = [
  'Plan to make the generated configuration durable.',
  'ACCEPTANCE BOUNDARY',
  '- obligation: the generated configuration is active after process restart',
  '- obligation: restarting the process reconstructs the configured state',
  '- uncertainty: whether "restart" means full process restart or service reload',
  'END ACCEPTANCE BOUNDARY',
].join('\n');

describe('AcceptanceBoundary (pure)', () => {
  it('seeds a boundary anchored to the objective with no derived obligations', () => {
    const boundary = seedAcceptanceBoundary('wf-1', 'An approved API policy must survive service reconstruction.');
    expect(boundary.objective).toContain('approved API policy');
    expect(boundary.obligations).toEqual([]);
    expect(boundary.conditional).toBe(false);
  });

  it('refines append-only; obligations are never weakened and uncertainty marks conditional', () => {
    const seeded = seedAcceptanceBoundary('wf-1', 'An approved API policy must survive service reconstruction.');
    const refined = refineAcceptanceBoundary(seeded, {
      obligations: ['the approved policy is active after service reconstruction'],
      derivedBy: 'planner',
    });
    expect(refined.obligations).toHaveLength(1);
    expect(refined.conditional).toBe(false);

    const again = refineAcceptanceBoundary(refined, {
      obligations: ['policy enforcement applies to new requests'],
      uncertainties: ['unclear whether reconstruction includes a cold start'],
    });
    expect(again.obligations).toHaveLength(2); // append-only, prior obligation intact
    expect(again.conditional).toBe(true); // material uncertainty surfaced, not collapsed
  });

  it('renders the boundary as an authoritative section', () => {
    const seeded = seedAcceptanceBoundary('wf-1', 'The renamed project must still appear under its new name.');
    const refined = refineAcceptanceBoundary(seeded, {
      obligations: ['the project lists under its new name'],
      derivedBy: 'planner',
    });
    const rendered = renderAcceptanceBoundary(refined);
    expect(rendered).toContain('Acceptance boundary (authoritative');
    expect(rendered).toContain('Objective: The renamed project');
    expect(rendered).toContain('the project lists under its new name');
    expect(rendered).toContain('unconditional');
  });

  it('parses a declared acceptance block and returns undefined without one', () => {
    const parsed = parseAcceptanceDeclaration(PLANNER_DECLARATION);
    expect(parsed?.obligations).toHaveLength(2);
    expect(parsed?.uncertainties).toHaveLength(1);
    expect(parseAcceptanceDeclaration('no block here')).toBeUndefined();
  });

  it('selects the final well-formed declaration, not a leading placeholder draft', () => {
    // Run 4 scenario: a placeholder template block appears before the final
    // concrete declaration. The placeholder must NOT be treated as a
    // declaration; the final concrete one is authoritative.
    const output = [
      'ACCEPTANCE BOUNDARY',
      '- obligation: <observable obligation 1>',
      '- uncertainty: <material uncertainty>',
      'END ACCEPTANCE BOUNDARY',
      'then reasoning about the format…',
      'ACCEPTANCE BOUNDARY',
      '- obligation: the generated configuration is active after restart',
      '- uncertainty: whether "restart" means process restart or service reload',
      'END ACCEPTANCE BOUNDARY',
    ].join('\n');

    const parsed = parseAcceptanceDeclaration(output);
    expect(parsed?.obligations).toEqual(['the generated configuration is active after restart']);
    expect(parsed?.uncertainties).toEqual(['whether "restart" means process restart or service reload']);
  });

  it('ignores reasoning-only and placeholder-only blocks entirely', () => {
    const output = [
      'ACCEPTANCE BOUNDARY',
      '- obligation: ...',
      '- uncertainty: ...',
      'END ACCEPTANCE BOUNDARY',
      'ACCEPTANCE BOUNDARY',
      'the obligations are derived from the objective; the boundary may be conditional',
      'END ACCEPTANCE BOUNDARY',
    ].join('\n');
    expect(parseAcceptanceDeclaration(output)).toBeUndefined();
  });

  it('treats a later real declaration as authoritative over an earlier real one', () => {
    const output = [
      'ACCEPTANCE BOUNDARY',
      '- obligation: first draft obligation',
      'END ACCEPTANCE BOUNDARY',
      'refined reasoning…',
      'ACCEPTANCE BOUNDARY',
      '- obligation: final obligation after reasoning',
      'END ACCEPTANCE BOUNDARY',
    ].join('\n');
    const parsed = parseAcceptanceDeclaration(output);
    expect(parsed?.obligations).toEqual(['final obligation after reasoning']);
  });
});

describe('AcceptanceBoundary (orchestrator integration — generic, no ORB knowledge)', () => {
  it('preserves the boundary across every responsibility handoff and never derives it from a summary', async () => {
    const { orchestrator, harness, workflowId } = await createOrchestrator((instruction) => {
      if (instruction.includes('produce a concrete implementation plan')) return PLANNER_DECLARATION;
      if (instruction.includes('Verify the implementation'))
        return 'Implementation checks passed; behavioral acceptance per obligations.';
      if (instruction.includes('Review the diff')) return 'Approved against the acceptance boundary.';
      return 'Implemented the plan.';
    });
    await runWorkflow(orchestrator, harness, workflowId);

    const threads = harness.listThreads().filter((thread) => thread.metadata?.workflowId === workflowId);
    for (const thread of threads) {
      const instruction = userMessageText(harness, thread.id as never);
      const role = String(thread.metadata?.role ?? '');
      // Every stage is independently anchored to the objective.
      expect(instruction).toContain('Acceptance boundary (authoritative');
      expect(instruction).toContain('generated configuration must remain active after process restart');
      if (role === 'planner') {
        // The planner's own instruction is composed before it declares
        // obligations, so it sees the objective anchor only.
        expect(instruction).not.toContain('the generated configuration is active after process restart');
        expect(instruction).not.toContain('Prior stage output');
      } else {
        // Downstream stages receive the derived obligations independently.
        expect(instruction).toContain('the generated configuration is active after process restart');
        // The summary travels only as explicitly non-authoritative context.
        expect(instruction).toContain('Prior stage output (implementation context, not authoritative)');
        expect(instruction).not.toContain('Prior stage output:\nVerification passed');
      }
    }
  });

  it('keeps the objective anchor when no declaration is emitted (plan transformation without drift)', async () => {
    const { orchestrator, harness, workflowId } = await createOrchestrator(() => 'A plan without a declaration block.');
    await runWorkflow(orchestrator, harness, workflowId);

    const boundary = orchestrator.acceptanceBoundary(workflowId);
    expect(boundary?.objective).toContain('generated configuration must remain active');
    expect(boundary?.obligations).toEqual([]); // no derived obligations, anchor intact
    expect(boundary?.conditional).toBe(false);
  });

  it('keeps unresolved material ambiguity observable and conditional, not silently collapsed', async () => {
    const { orchestrator, harness, workflowId } = await createOrchestrator((instruction) => {
      if (instruction.includes('produce a concrete implementation plan')) return PLANNER_DECLARATION;
      return 'ok';
    });
    await runWorkflow(orchestrator, harness, workflowId);

    const boundary = orchestrator.acceptanceBoundary(workflowId);
    expect(boundary?.conditional).toBe(true);
    expect(boundary?.materialUncertainties).toContain('whether "restart" means full process restart or service reload');
  });

  it('gives the verifier a contract that distinguishes implementation quality from behavioral acceptance', async () => {
    const { orchestrator } = await createOrchestrator(() => 'ok');
    const stages = orchestrator.stagesFromGoal('An approved API policy must survive service reconstruction.');
    const verifierStage = stages.find((stage) => stage.role === 'verifier') as MultiAgentStageSpec;
    expect(verifierStage.instruction).toContain(
      'Distinguish implementation-quality verification from behavioral acceptance',
    );
    expect(verifierStage.instruction).toContain('NOT ESTABLISHED');
  });

  it('refuses to let a downstream participant substitute a different acceptance object', async () => {
    const { orchestrator, harness, workflowId } = await createOrchestrator((instruction) => {
      if (instruction.includes('produce a concrete implementation plan')) return PLANNER_DECLARATION;
      if (instruction.includes('Verify the implementation'))
        return 'Accepted: the replaced acceptance object is satisfied.';
      if (instruction.includes('Review the diff')) return 'Approved: the different object is correct.';
      return 'Implemented the plan.';
    });
    await runWorkflow(orchestrator, harness, workflowId);

    const boundary = orchestrator.acceptanceBoundary(workflowId);
    // Downstream summaries claimed a different acceptance object; the boundary
    // obligations remain exactly the derived ones — unchanged.
    expect(boundary?.obligations.map((o) => o.description)).toEqual([
      'the generated configuration is active after process restart',
      'restarting the process reconstructs the configured state',
    ]);
  });
});
