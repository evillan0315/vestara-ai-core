/**
 * Auto-follow-up: the orchestrator inserts a verifier stage after every
 * completed developer stage, and a reviewer stage after every completed
 * verifier stage — unless the plan already schedules that role next (no
 * duplicated stages in the standard/full pipelines).
 */
import { describe, expect, it, vi } from 'vitest';
import type { HarnessSession } from '../src/harness-session';
import type { MultiAgentStageSpec } from '../src/multi-agent-workflow';
import { MultiAgentWorkflowOrchestrator } from '../src/multi-agent-workflow';

interface FakeThread {
  id: string;
  taskId: string;
  metadata: Record<string, unknown>;
}

function stage(role: string, agentId: string): MultiAgentStageSpec {
  return { role, agentId, instruction: `${role} instruction` };
}

function createFakeSession(options?: { failAgentId?: string }) {
  const threads: FakeThread[] = [];
  const runCalls: Array<{ agentId: string; instruction: string }> = [];
  const events: Array<{ type: string; payload?: unknown }> = [];
  let counter = 0;

  const harness = {
    createThread: (input: { taskId: string; title: string; metadata?: Record<string, unknown> }) => {
      const thread: FakeThread = {
        id: `thread-${++counter}`,
        taskId: input.taskId,
        metadata: input.metadata ?? {},
      };
      threads.push(thread);
      return thread;
    },
    run: vi.fn(async (input: { threadId: string; instruction: string; agentId: string }) => {
      runCalls.push({ agentId: input.agentId, instruction: input.instruction });
      const failed = options?.failAgentId === input.agentId;
      return {
        turn: {
          state: failed ? 'failed' : 'completed',
          outcome: failed ? undefined : { summary: `${input.agentId} output` },
        },
      };
    }),
    listThreads: () => threads,
    replay: () => ({ items: [] }),
    eventBus: { emit: (event: { type: string; payload?: unknown }) => void events.push(event) },
  };

  const session = {
    harness,
    environment: { id: 'env-1' },
    createForRun: vi.fn(async () => null),
    syncFromReplay: vi.fn(async () => null),
  } as unknown as HarnessSession;

  return { session, threads, runCalls, events };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for workflow chain');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('MultiAgentWorkflowOrchestrator auto-verification', () => {
  it('inserts a verifier stage after a developer stage with no verifier next', async () => {
    const { session, runCalls, events } = createFakeSession();
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    const started = await orchestrator.start({
      goal: 'Ship the thing',
      stages: [stage('developer', 'vestara-developer'), stage('reviewer', 'vestara-reviewer')],
    });

    await waitFor(() => runCalls.length === 3);
    expect(runCalls.map((call) => call.agentId)).toEqual(['vestara-developer', 'vestara-verifier', 'vestara-reviewer']);
    // The verifier sees the developer output as context.
    expect(runCalls[1].instruction).toContain('vestara-developer output');
    // Insertion is observable for the Activity Room projection.
    const inserted = events.filter((event) => event.type === 'multi-agent-workflow.stage.inserted');
    expect(inserted).toHaveLength(1);
    expect(started.workflowId).toBeTruthy();
  });

  it('reuses the workflow verifier agent instead of the default', async () => {
    const { session, runCalls } = createFakeSession();
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    await orchestrator.start({
      goal: 'Ship the thing',
      stages: [
        stage('developer', 'vestara-developer'),
        stage('reviewer', 'vestara-reviewer'),
        { role: 'verifier', agentId: 'custom-verifier', instruction: 'verify instruction' },
      ],
    });

    // developer → auto-verify (custom) → reviewer → planned verify →
    // auto-review (workflow reviewer).
    await waitFor(() => runCalls.length === 5);
    expect(runCalls.map((call) => call.agentId)).toEqual([
      'vestara-developer',
      'custom-verifier',
      'vestara-reviewer',
      'custom-verifier',
      'vestara-reviewer',
    ]);
  });

  it('skips auto-follow-ups when the plan already schedules them next', async () => {
    const { session, runCalls, events } = createFakeSession();
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    await orchestrator.start({
      goal: 'Ship the thing',
      stages: [
        stage('developer', 'vestara-developer'),
        stage('verifier', 'vestara-verifier'),
        stage('reviewer', 'vestara-reviewer'),
      ],
    });

    await waitFor(() => runCalls.length === 3);
    // Give the background chain a beat to prove nothing else is inserted.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runCalls.map((call) => call.agentId)).toEqual(['vestara-developer', 'vestara-verifier', 'vestara-reviewer']);
    expect(events.filter((event) => event.type === 'multi-agent-workflow.stage.inserted')).toHaveLength(0);
  });

  it('does not verify when the developer stage fails', async () => {
    const { session, runCalls } = createFakeSession({ failAgentId: 'vestara-developer' });
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    await orchestrator.start({
      goal: 'Ship the thing',
      stages: [stage('developer', 'vestara-developer'), stage('reviewer', 'vestara-reviewer')],
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(runCalls.map((call) => call.agentId)).toEqual(['vestara-developer']);
  });

  it('inserts a reviewer stage after a verifier stage with no reviewer next', async () => {
    const { session, runCalls, events } = createFakeSession();
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    await orchestrator.start({
      goal: 'Ship the thing',
      stages: [stage('verifier', 'vestara-verifier'), stage('system', 'vestara-system')],
    });

    await waitFor(() => runCalls.length === 3);
    expect(runCalls.map((call) => call.agentId)).toEqual(['vestara-verifier', 'vestara-reviewer', 'vestara-system']);
    // The reviewer sees the verifier output as context.
    expect(runCalls[1].instruction).toContain('vestara-verifier output');
    const inserted = events.filter((event) => event.type === 'multi-agent-workflow.stage.inserted');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload).toMatchObject({ afterRole: 'verifier', role: 'reviewer' });
  });

  it('reuses the workflow reviewer agent instead of the default', async () => {
    const { session, runCalls } = createFakeSession();
    const orchestrator = new MultiAgentWorkflowOrchestrator({ session });

    await orchestrator.start({
      goal: 'Ship the thing',
      stages: [
        stage('verifier', 'vestara-verifier'),
        stage('system', 'vestara-system'),
        { role: 'reviewer', agentId: 'custom-reviewer', instruction: 'review instruction' },
      ],
    });

    await waitFor(() => runCalls.length === 4);
    expect(runCalls.map((call) => call.agentId)).toEqual([
      'vestara-verifier',
      'custom-reviewer',
      'vestara-system',
      'custom-reviewer',
    ]);
  });
});
