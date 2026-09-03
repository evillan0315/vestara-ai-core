/**
 * Agent Harness API — harness-backed execution of durable agent turns.
 *
 * The harness is the intended execution path (see the legacy capability
 * orchestrator note); these routes expose runs, durable thread replay, pending
 * approval discovery/resolution, steering, cancellation, and resume. POST run
 * returns identifiers immediately; progress flows through the event stream.
 */

import type * as http from 'node:http';
import type { AgentEnvironment } from '@vestara/types';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

function resolveEnvironment(ctx: WorkspaceContext, body: Record<string, unknown>): AgentEnvironment {
  if (body.environment && typeof body.environment === 'object') {
    return { ...ctx.agentEnvironment, ...(body.environment as Partial<AgentEnvironment>) };
  }
  return ctx.agentEnvironment;
}

export async function handleAgentHarnessRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const harness = ctx.agentHarness;
  if (!harness) return false;

  // POST /api/agents/:agentId/runs — create a durable harness-backed run.
  const runsMatch = p.match(/^\/api\/agents\/([^/]+)\/runs$/);
  if (runsMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const agentId = decodeURIComponent(runsMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!instruction) {
      json(res, 400, { error: 'instruction is required' });
      return true;
    }
    const environment = resolveEnvironment(ctx, body);
    const title = typeof body.title === 'string' ? body.title : instruction;
    const taskId = typeof body.taskId === 'string' ? body.taskId : `task-${Date.now()}`;
    const thread = harness.createThread({ taskId, title, environment, metadata: { agentId, runSource: 'api' } });
    // Associate a durable ExecutionSession with this harness thread so the run
    // is visible in the Execution Center and survives restart.
    const session = await ctx.harnessSession
      .createForRun({ threadId: thread.id, goal: title, agentId })
      .catch(() => null);
    // Capture a change baseline for this thread so the change.* projection
    // can attribute filesystem + git diffs to the run.
    void ctx.changeProjector.captureBaseline({ threadId: thread.id, taskId, agentId }).catch(() => {});
    // Execute in the background; the response carries identifiers immediately.
    void harness
      .run({ threadId: thread.id, instruction, agentId, environment })
      .then(async () => {
        await ctx.harnessSession.syncFromReplay(thread.id).catch(() => null);
        await ctx.changeProjector.projectChanges({ threadId: thread.id, taskId, agentId }).catch(() => {});
        ctx.publish({
          id: `tui-task-${Date.now()}`,
          type: 'tui.task.updated',
          timestamp: new Date().toISOString(),
          category: 'system',
          actor: { id: 'agent-harness', name: 'Agent Harness', type: 'system' },
          resource: { type: 'agent-thread', id: thread.id, name: title },
          message: 'Harness task completed',
          metadata: { threadId: thread.id },
        });
      })
      .catch((error: unknown) => {
        ctx.telemetry.track({
          agent: agentId,
          timestamp: new Date().toISOString(),
          type: 'agent-harness.run-failed',
          status: 'failed',
          operation: 'verify',
          task: 'agent-harness',
          progress: 0,
          phase: 'run',
          detail: error instanceof Error ? error.message : String(error),
          metadata: { threadId: thread.id },
        });
      });
    const snapshot = harness.snapshot(thread.id);
    json(res, 201, {
      threadId: thread.id,
      turnId: snapshot.turnId,
      runId: snapshot.runId,
      state: snapshot.state,
      sessionId: session?.sessionId,
    });
    return true;
  }

  // GET /api/agent-threads — durable thread index.
  if (method === 'GET' && p === '/api/agent-threads') {
    json(res, 200, { threads: harness.listThreads() });
    return true;
  }

  const threadMatch = p.match(/^\/api\/agent-threads\/([^/]+)$/);
  if (method === 'GET' && threadMatch) {
    const threadId = decodeURIComponent(threadMatch[1]);
    const thread = ctx.agentThreadStore.getThread(threadId as never);
    if (!thread) {
      json(res, 404, { error: 'thread not found' });
      return true;
    }
    const session = await ctx.harnessSession.syncFromReplay(threadId).catch(() => null);
    const changes = await ctx.changeProjector
      .projectChanges({
        threadId: threadId as never,
        taskId: thread.taskId,
        agentId: String(thread.metadata?.agentId ?? ''),
      })
      .catch(() => []);
    json(res, 200, { thread, ...harness.snapshot(threadId as never), session, changes });
    return true;
  }

  const itemsMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/items$/);
  if (method === 'GET' && itemsMatch) {
    const threadId = decodeURIComponent(itemsMatch[1]);
    const thread = ctx.agentThreadStore.getThread(threadId as never);
    if (!thread) {
      json(res, 404, { error: 'thread not found' });
      return true;
    }
    json(res, 200, harness.replay(threadId as never));
    return true;
  }

  const eventsMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/events$/);
  if (method === 'GET' && eventsMatch) {
    const threadId = decodeURIComponent(eventsMatch[1]);
    json(res, 200, { events: ctx.engineeringEvents.query({ threadId }) });
    return true;
  }

  const approvalsMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/approvals$/);
  if (method === 'GET' && approvalsMatch) {
    const threadId = decodeURIComponent(approvalsMatch[1]);
    json(res, 200, { approvals: await harness.pendingApprovals(threadId) });
    return true;
  }

  const resolveMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/approvals\/([^/]+)\/resolve$/);
  if (resolveMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const threadId = decodeURIComponent(resolveMatch[1]);
    const approvalId = decodeURIComponent(resolveMatch[2]);
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    try {
      const result = await harness.decideApproval(
        threadId as never,
        approvalId as never,
        body.approved !== false,
        body.environment ? resolveEnvironment(ctx, body) : undefined,
      );
      json(res, 200, {
        thread: result.thread,
        turn: result.turn,
        outcome: result.outcome,
        approvalId: result.approvalId,
      });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const steerMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/steer$/);
  if (steerMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const threadId = decodeURIComponent(steerMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    try {
      const item = harness.steer(threadId as never, String(body.message ?? ''));
      json(res, 200, { item });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const cancelMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const threadId = decodeURIComponent(cancelMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    try {
      const turn = harness.cancel(threadId as never, typeof body.reason === 'string' ? body.reason : undefined);
      json(res, 200, { turn });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const resumeMatch = p.match(/^\/api\/agent-threads\/([^/]+)\/resume$/);
  if (resumeMatch && method === 'POST') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const threadId = decodeURIComponent(resumeMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    try {
      const result = await harness.resume(
        threadId as never,
        body.environment ? resolveEnvironment(ctx, body) : undefined,
      );
      json(res, 200, { thread: result.thread, turn: result.turn, outcome: result.outcome });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
