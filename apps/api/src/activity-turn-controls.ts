import type { AgentMessageActivity } from '@vestara/activity-room';

export type ActivityTurnControlStatus = 'running' | 'stop-requested' | 'completed' | 'failed' | 'cancelled';

export interface ActivityTurnControlView {
  readonly activityId: string;
  readonly agentId: string;
  readonly conversationId: string;
  readonly status: ActivityTurnControlStatus;
  readonly queuedCount: number;
}

interface QueueItem {
  readonly requestId: string;
  readonly record: AgentMessageActivity;
}

interface Entry {
  readonly activityId: string;
  readonly agentId: string;
  readonly controller: AbortController;
  readonly queue: QueueItem[];
  readonly seenRequestIds: Set<string>;
  conversationId?: string;
  status: ActivityTurnControlStatus;
  runQueued: (record: AgentMessageActivity, conversationId: string) => Promise<unknown>;
}

class ActivityTurnControlRegistry {
  private readonly byActivity = new Map<string, Entry>();
  private readonly byConversation = new Map<string, Entry>();

  start(input: {
    readonly activityId: string;
    readonly agentId: string;
    readonly runQueued: (record: AgentMessageActivity, conversationId: string) => Promise<unknown>;
  }): { controller: AbortController; bindConversation: (conversationId: string) => void } {
    const existing = this.byActivity.get(input.activityId);
    if (existing) return { controller: existing.controller, bindConversation: (id) => this.bind(existing, id) };
    const entry: Entry = {
      activityId: input.activityId,
      agentId: input.agentId,
      controller: new AbortController(),
      queue: [],
      seenRequestIds: new Set(),
      status: 'running',
      runQueued: input.runQueued,
    };
    this.byActivity.set(entry.activityId, entry);
    return { controller: entry.controller, bindConversation: (id) => this.bind(entry, id) };
  }

  private bind(entry: Entry, conversationId: string): void {
    if (entry.conversationId === conversationId) return;
    if (entry.conversationId) this.byConversation.delete(entry.conversationId);
    entry.conversationId = conversationId;
    this.byConversation.set(conversationId, entry);
  }

  canQueue(conversationId: string, requestId: string): boolean {
    const entry = this.byConversation.get(conversationId);
    return Boolean(entry && (entry.status === 'running' || entry.status === 'stop-requested') && requestId);
  }

  enqueue(
    conversationId: string,
    requestId: string,
    record: AgentMessageActivity,
  ):
    | {
        readonly status: 'queued';
        readonly conversationId: string;
        readonly requestId: string;
        readonly queuedCount: number;
      }
    | {
        readonly status: 'duplicate';
        readonly conversationId: string;
        readonly requestId: string;
        readonly queuedCount: number;
      }
    | { readonly status: 'unavailable'; readonly reason: string } {
    const entry = this.byConversation.get(conversationId);
    if (!entry || (entry.status !== 'running' && entry.status !== 'stop-requested')) {
      return { status: 'unavailable', reason: 'active-turn-unavailable' };
    }
    if (entry.seenRequestIds.has(requestId)) {
      return { status: 'duplicate', conversationId, requestId, queuedCount: entry.queue.length };
    }
    entry.seenRequestIds.add(requestId);
    entry.queue.push({ requestId, record });
    return { status: 'queued', conversationId, requestId, queuedCount: entry.queue.length };
  }

  requestStop(conversationId: string): { status: 'requested' | 'unavailable'; conversationId: string } {
    const entry = this.byConversation.get(conversationId);
    if (!entry || (entry.status !== 'running' && entry.status !== 'stop-requested')) {
      return { status: 'unavailable', conversationId };
    }
    entry.status = 'stop-requested';
    entry.controller.abort();
    return { status: 'requested', conversationId };
  }

  finish(conversationId: string, status: 'completed' | 'failed' | 'cancelled'): boolean {
    const entry = this.byConversation.get(conversationId);
    if (!entry) return false;
    const next = entry.queue.shift();
    if (next) {
      entry.status = 'running';
      void entry.runQueued(next.record, conversationId);
      return true;
    }
    entry.status = status;
    return false;
  }

  list(): readonly ActivityTurnControlView[] {
    return [...this.byActivity.values()]
      .filter((entry): entry is Entry & { conversationId: string } => Boolean(entry.conversationId))
      .filter((entry) => entry.status === 'running' || entry.status === 'stop-requested')
      .map((entry) => ({
        activityId: entry.activityId,
        agentId: entry.agentId,
        conversationId: entry.conversationId,
        status: entry.status,
        queuedCount: entry.queue.length,
      }));
  }
}

export const activityTurnControls = new ActivityTurnControlRegistry();
