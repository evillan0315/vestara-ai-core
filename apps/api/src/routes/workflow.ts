/**
 * Workflow routes — canonical agent workflow projection + incremental event
 * envelopes, derived from the durable thread replay and engineering events.
 * Threads tagged with a shared `workflowId` (multi-agent orchestration) are
 * merged into one aggregated projection across all sibling stage threads.
 */

import type * as http from 'node:http';
import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { TaskFileChange } from '@vestara/tui-protocol';
import type { TaskThreadId } from '@vestara/types';
import {
  type AgentWorkflowProjection,
  projectWorkflow,
  projectWorkflowAcrossThreads,
  workflowEnvelopes,
} from '@vestara/workflow-projections';
import { getActivityRoom } from '../activity-room';
import { projectWorkflowParticipants } from '../participants';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

function changeState(events: readonly EngineeringTruthEvent[]): {
  changes: TaskFileChange[];
  changeSummary?: { summary: string; additions: number; deletions: number };
} {
  const changes: TaskFileChange[] = events
    .filter((event) => event.type.startsWith('change.file.'))
    .map((event) => {
      const payload = event.payload as {
        path?: unknown;
        operation?: unknown;
        additions?: unknown;
        deletions?: unknown;
      };
      return {
        taskId: event.taskId ?? '',
        path: String(payload.path ?? ''),
        operation: (payload.operation as TaskFileChange['operation']) ?? 'update',
        additions: Number(payload.additions ?? 0) || 0,
        deletions: Number(payload.deletions ?? 0) || 0,
        hunks: [],
        verificationIds: [],
        observedAt: event.at,
        preExisting: false,
      };
    });
  const summaryEvent = [...events].reverse().find((event) => event.type === 'change.summary.updated');
  return {
    changes,
    changeSummary: summaryEvent
      ? {
          summary: String((summaryEvent.payload as Record<string, unknown>).summary ?? ''),
          additions: Number((summaryEvent.payload as Record<string, unknown>).additions ?? 0) || 0,
          deletions: Number((summaryEvent.payload as Record<string, unknown>).deletions ?? 0) || 0,
        }
      : undefined,
  };
}

async function agentNameMap(ctx: WorkspaceContext): Promise<Readonly<Record<string, string>>> {
  const agents = await ctx.agents.listAgents().catch(() => [] as never[]);
  const names: Record<string, string> = {};
  for (const agent of agents as Array<{ id?: string; name?: string }>) {
    if (agent.id) names[agent.id] = agent.name ?? agent.id;
    if (agent.name) names[agent.name] = agent.name;
  }
  return names;
}

function projectAt(
  ctx: WorkspaceContext,
  threadId: TaskThreadId,
  events: readonly EngineeringTruthEvent[],
  agentNames: Readonly<Record<string, string>>,
): AgentWorkflowProjection {
  const replay = ctx.agentThreadStore.replay(threadId);
  return projectWorkflow({ replay, events, agentNames, ...changeState(events) });
}

/** Aggregate the canonical projection across sibling stage threads of a workflow. */
function projectAggregated(
  ctx: WorkspaceContext,
  workflowId: string,
  agentNames: Readonly<Record<string, string>>,
): AgentWorkflowProjection {
  const siblings = ctx.agentThreadStore
    .listThreads()
    .filter((thread) => thread.metadata?.workflowId === workflowId)
    .sort((left, right) => Number(left.metadata?.stageIndex ?? 0) - Number(right.metadata?.stageIndex ?? 0));
  return projectWorkflowAcrossThreads({
    workflowId,
    threads: siblings.map((thread) => {
      const events = ctx.engineeringEvents.query({ threadId: thread.id, limit: 100_000 });
      return {
        replay: ctx.agentThreadStore.replay(thread.id),
        events,
        agentNames,
        ...changeState(events),
      };
    }),
  });
}

/** Resolve the workflowId governing a thread (its own id if not multi-agent). */
function workflowIdForThread(ctx: WorkspaceContext, threadId: string): string {
  const thread = ctx.agentThreadStore.getThread(threadId as TaskThreadId);
  return String(thread?.metadata?.workflowId ?? threadId);
}

/** True when a thread is one stage of a multi-agent workflow. */
function isMultiAgent(ctx: WorkspaceContext, threadId: string): boolean {
  const thread = ctx.agentThreadStore.getThread(threadId as TaskThreadId);
  return Boolean(thread?.metadata?.workflowId);
}

export async function handleWorkflowRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // POST /api/workflows — start a multi-agent workflow (ADR-118).
  if (method === 'POST' && p === '/api/workflows') {
    const body = JSON.parse((await readBody(_req)) || '{}') as Record<string, unknown>;
    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    if (!goal) {
      json(res, 400, { error: 'goal is required' });
      return true;
    }
    const agentIds = body.agentIds;
    const stages = ctx.multiAgentWorkflow.stagesFromGoal(goal, agentIds);
    const workflow = await ctx.multiAgentWorkflow.start({ goal, stages });
    json(res, 201, workflow);
    return true;
  }

  const snapshotMatch = p.match(/^\/api\/workflow\/([^/]+)$/);
  if (method === 'GET' && snapshotMatch) {
    const threadId = decodeURIComponent(snapshotMatch[1]) as TaskThreadId;
    if (!ctx.agentThreadStore.getThread(threadId)) {
      json(res, 404, { error: 'Thread not found' });
      return true;
    }
    const agentNames = await agentNameMap(ctx);
    if (isMultiAgent(ctx, threadId)) {
      const workflowId = workflowIdForThread(ctx, threadId);
      json(res, 200, { projection: projectAggregated(ctx, workflowId, agentNames), workflowId });
      return true;
    }
    const all = ctx.engineeringEvents.query({ threadId, limit: 100_000 });
    json(res, 200, { projection: projectAt(ctx, threadId, all, agentNames) });
    return true;
  }

  // Acceptance boundary — the observable organizational acceptance contract.
  const acceptanceMatch = p.match(/^\/api\/workflow\/([^/]+)\/acceptance$/);
  if (method === 'GET' && acceptanceMatch) {
    const threadId = decodeURIComponent(acceptanceMatch[1]) as TaskThreadId;
    const thread = ctx.agentThreadStore.getThread(threadId);
    if (!thread) {
      json(res, 404, { error: 'Thread not found' });
      return true;
    }
    const workflowId = isMultiAgent(ctx, threadId) ? workflowIdForThread(ctx, threadId) : threadId;
    const boundary = ctx.multiAgentWorkflow.acceptanceBoundary(workflowId);
    if (!boundary) {
      json(res, 404, { error: 'ACCEPTANCE_BOUNDARY_NOT_FOUND', message: `No acceptance boundary for ${workflowId}.` });
      return true;
    }
    json(res, 200, { workflowId, boundary });
    return true;
  }

  // Live session narrative — coalesced per-participant stream output.
  // The id may be a thread id OR the workflow id.
  const liveStreamMatch = p.match(/^\/api\/workflow\/([^/]+)\/live-stream$/);
  if (method === 'GET' && liveStreamMatch) {
    const id = decodeURIComponent(liveStreamMatch[1]);
    const asThread = ctx.agentThreadStore.getThread(id as TaskThreadId);
    const workflowId = asThread
      ? isMultiAgent(ctx, asThread.id)
        ? workflowIdForThread(ctx, asThread.id)
        : asThread.id
      : id;
    const live = ctx.activityRoomStreams
      .live()
      .filter((item) => {
        const t = ctx.agentThreadStore.getThread(item.threadId as TaskThreadId);
        return t?.metadata?.workflowId === workflowId;
      })
      .map((item) => ({
        threadId: item.threadId,
        role: item.role,
        agentId: item.agentId,
        sessionId: item.sessionId,
        text: item.text,
        lastActivityAt: item.lastActivityAt,
      }));
    json(res, 200, { workflowId, live });
    return true;
  }

  // Participants — the real agents in the real workflow with current state.
  // The id may be a thread id OR the workflow id itself.
  const participantsMatch = p.match(/^\/api\/workflow\/([^/]+)\/participants$/);
  if (method === 'GET' && participantsMatch) {
    const id = decodeURIComponent(participantsMatch[1]);
    const asThread = ctx.agentThreadStore.getThread(id as TaskThreadId);
    const workflowId = asThread
      ? isMultiAgent(ctx, asThread.id)
        ? workflowIdForThread(ctx, asThread.id)
        : asThread.id
      : id;
    const threads = ctx.agentThreadStore
      .listThreads()
      .filter((candidate) => candidate.metadata?.workflowId === workflowId)
      .sort((left, right) => Number(left.metadata?.stageIndex ?? 0) - Number(right.metadata?.stageIndex ?? 0));
    if (threads.length === 0) {
      json(res, 404, { error: 'WORKFLOW_NOT_FOUND', message: `No workflow participants for ${id}.` });
      return true;
    }
    const threadIds = new Set<string>(threads.map((candidate) => candidate.id));
    const { records } = await getActivityRoom().store.list({});
    const workflowRecords = [...records].reverse().filter((record) => {
      const rid = (record as { threadId?: string }).threadId;
      return rid !== undefined && threadIds.has(rid);
    });
    const projection = projectWorkflowParticipants({
      workflowId,
      threads,
      records: workflowRecords,
      boundary: ctx.multiAgentWorkflow.acceptanceBoundary(workflowId),
    });
    json(res, 200, projection);
    return true;
  }

  // Temporal replay: reconstruct the projection at a past event sequence.
  const atMatch = p.match(/^\/api\/workflow\/([^/]+)\/at$/);
  if (method === 'GET' && atMatch) {
    const threadId = decodeURIComponent(atMatch[1]) as TaskThreadId;
    const seq = Number(new URL(_req.url ?? '', 'http://127.0.0.1').searchParams.get('seq') ?? 0) || 0;
    if (!ctx.agentThreadStore.getThread(threadId)) {
      json(res, 404, { error: 'Thread not found' });
      return true;
    }
    const all = ctx.engineeringEvents.query({ threadId, limit: 100_000 });
    const atEvents = all.filter((event) => event.seq <= seq);
    const agentNames = await agentNameMap(ctx);
    if (isMultiAgent(ctx, threadId)) {
      const workflowId = workflowIdForThread(ctx, threadId);
      const siblings = ctx.agentThreadStore
        .listThreads()
        .filter((thread) => thread.metadata?.workflowId === workflowId)
        .sort((left, right) => Number(left.metadata?.stageIndex ?? 0) - Number(right.metadata?.stageIndex ?? 0));
      const maxSequence = Math.max(
        0,
        ...siblings.map(
          (sibling) => ctx.engineeringEvents.query({ threadId: sibling.id, limit: 100_000 }).at(-1)?.seq ?? 0,
        ),
      );
      const projection = projectWorkflowAcrossThreads({
        workflowId,
        threads: siblings.map((sibling) => {
          const siblingEvents = ctx.engineeringEvents
            .query({ threadId: sibling.id, limit: 100_000 })
            .filter((event) => event.seq <= seq);
          return {
            replay: ctx.agentThreadStore.replay(sibling.id),
            events: siblingEvents,
            agentNames,
            ...changeState(siblingEvents),
          };
        }),
      });
      json(res, 200, { projection, maxSequence, sequence: seq });
      return true;
    }
    json(res, 200, {
      projection: projectAt(ctx, threadId, atEvents, agentNames),
      maxSequence: all.at(-1)?.seq ?? 0,
      sequence: seq,
    });
    return true;
  }

  const eventsMatch = p.match(/^\/api\/workflow\/([^/]+)\/events$/);
  if (method === 'GET' && eventsMatch) {
    const threadId = decodeURIComponent(eventsMatch[1]) as TaskThreadId;
    const after = Number(new URL(_req.url ?? '', 'http://127.0.0.1').searchParams.get('after') ?? 0) || 0;
    if (!ctx.agentThreadStore.getThread(threadId)) {
      json(res, 404, { error: 'Thread not found' });
      return true;
    }
    const all = ctx.engineeringEvents.query({ threadId, limit: 100_000 });
    const beforeEvents = all.filter((event) => event.seq <= after);
    const agentNames = await agentNameMap(ctx);
    const before = projectAt(ctx, threadId, beforeEvents, agentNames);
    const current = projectAt(ctx, threadId, all, agentNames);
    json(res, 200, { envelopes: workflowEnvelopes(before, current, after + 1) });
    return true;
  }

  return false;
}
