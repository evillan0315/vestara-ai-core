/**
 * Workflow routes — canonical agent workflow projection + incremental event
 * envelopes, derived from the durable thread replay and engineering events.
 */

import type * as http from 'node:http';
import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { TaskFileChange } from '@vestara/tui-protocol';
import type { TaskThreadId } from '@vestara/types';
import { type AgentWorkflowProjection, projectWorkflow, workflowEnvelopes } from '@vestara/workflow-projections';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

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

function projectAt(
  ctx: WorkspaceContext,
  threadId: TaskThreadId,
  events: readonly EngineeringTruthEvent[],
): AgentWorkflowProjection {
  const replay = ctx.agentThreadStore.replay(threadId);
  return projectWorkflow({ replay, events, ...changeState(events) });
}

export async function handleWorkflowRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const snapshotMatch = p.match(/^\/api\/workflow\/([^/]+)$/);
  if (method === 'GET' && snapshotMatch) {
    const threadId = decodeURIComponent(snapshotMatch[1]) as TaskThreadId;
    if (!ctx.agentThreadStore.getThread(threadId)) {
      json(res, 404, { error: 'Thread not found' });
      return true;
    }
    const all = ctx.engineeringEvents.query({ threadId, limit: 100_000 });
    json(res, 200, { projection: projectAt(ctx, threadId, all) });
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
    const before = projectAt(ctx, threadId, beforeEvents);
    const current = projectAt(ctx, threadId, all);
    json(res, 200, { envelopes: workflowEnvelopes(before, current, after + 1) });
    return true;
  }

  return false;
}
