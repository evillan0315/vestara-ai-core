/**
 * ActivityService — Bridges internal EventBus events to domain events.
 *
 * Subscribes to the runtime EventBus and converts transport-level events
 * into structured domain events with full actor/resource attribution.
 * Maintains an ActivityLogStore for persistence and emits to connected
 * clients through the events-server.
 *
 * Architecture Traceability:
 *   PCS-020 → Real-Time Activity Stream
 */

import type { EventBus } from '@vestara/event-bus';
import type { WorkspaceEvent, WorkspaceEventActor } from '@vestara/events';
import { categorizeEvent } from '@vestara/events';
import type { Logger } from '@vestara/logger';
import type { Unsubscribe, VestaraEvent } from '@vestara/shared';
import type { ActivityLogStore } from './store';

const SYSTEM_ACTOR: WorkspaceEventActor = { id: 'system', name: 'System', type: 'system' };

const EVENT_MAP: Record<string, (payload: Record<string, unknown>) => Partial<WorkspaceEvent>> = {
  'conversation:created': (p) => ({
    category: 'conversation',
    type: 'conversation.started',
    actor: { id: (p.userId as string) || 'local', name: (p.userId as string) || 'User', type: 'user' },
    resource: { type: 'conversation', id: p.conversationId as string, name: (p.title as string) || 'Conversation' },
    message: 'Started conversation',
  }),
  'conversation:response.completed': (p) => ({
    category: 'conversation',
    type: 'conversation.response.completed',
    actor: { id: 'vestara', name: 'Vestara', type: 'system' },
    resource: { type: 'conversation', id: p.conversationId as string, name: 'Conversation' },
    message: p.tokens ? `Generated response (${p.tokens} tokens)` : 'Generated response',
    metadata: { tokens: p.tokens, latency: p.latency },
  }),
  'workspace:opened': (p) => ({
    category: 'workspace',
    type: 'workspace.opened',
    actor: { id: (p.userId as string) || 'local', name: 'User', type: 'user' },
    resource: { type: 'repository', id: p.repoPath as string, name: (p.name as string) || 'Repository' },
    message: `Opened ${(p.name as string) || 'repository'}`,
    metadata: { fileCount: p.fileCount, packageCount: p.packageCount },
  }),
  'workspace:index.completed': (p) => ({
    category: 'workspace',
    type: 'workspace.indexed',
    actor: SYSTEM_ACTOR,
    resource: { type: 'repository', id: (p.repoPath as string) || '', name: (p.name as string) || 'Repository' },
    message: `Indexed ${p.documentsIndexed ?? 0} documents`,
    metadata: { documentsIndexed: p.documentsIndexed, duration: p.duration },
  }),
  'plan:created': (p) => ({
    category: 'planning',
    type: 'plan.created',
    actor: { id: (p.userId as string) || 'local', name: (p.userName as string) || 'User', type: 'user' },
    resource: { type: 'plan', id: p.planId as string, name: (p.title as string) || 'Plan' },
    message: `Created plan: ${(p.title as string) || ''}`,
    metadata: { taskCount: p.taskCount },
  }),
  'plan:approved': (p) => ({
    category: 'planning',
    type: 'plan.approved',
    actor: { id: (p.userId as string) || 'local', name: (p.userName as string) || 'User', type: 'user' },
    resource: { type: 'plan', id: p.planId as string, name: (p.title as string) || 'Plan' },
    message: `Approved plan: ${(p.title as string) || ''}`,
  }),
  'changeset:created': (p) => ({
    category: 'implementation',
    type: 'changeset.created',
    actor: { id: (p.agentId as string) || 'vestara', name: (p.agentName as string) || 'Vestara', type: 'agent' },
    resource: { type: 'changeset', id: p.csId as string, name: (p.title as string) || 'Change Set' },
    message: `Created change set with ${p.fileCount ?? 0} file(s)`,
    metadata: { fileCount: p.fileCount, planId: p.planId },
  }),
  'changeset:applied': (p) => ({
    category: 'implementation',
    type: 'changeset.applied',
    actor: { id: (p.userId as string) || 'local', name: 'User', type: 'user' },
    resource: { type: 'changeset', id: p.csId as string, name: (p.title as string) || 'Change Set' },
    message: 'Applied change set to disk',
  }),
  'verification:started': (p) => ({
    category: 'verification',
    type: 'verification.started',
    actor: { id: (p.agentId as string) || 'verifier', name: (p.agentName as string) || 'Verifier', type: 'agent' },
    resource: { type: 'verification', id: p.verificationId as string, name: 'Verification' },
    message: 'Running verification checks...',
  }),
  'verification:completed': (p) => ({
    category: 'verification',
    type: 'verification.completed',
    actor: { id: (p.agentId as string) || 'verifier', name: (p.agentName as string) || 'Verifier', type: 'agent' },
    resource: { type: 'verification', id: p.verificationId as string, name: 'Verification' },
    message: p.allPassed ? 'All checks passed' : `${p.failedCount ?? 0} check(s) failed`,
    metadata: { passed: p.passedCount, failed: p.failedCount, total: p.totalChecks },
  }),
  'agent:started': (p) => ({
    category: 'agent',
    type: 'agent.started',
    actor: { id: p.agentId as string, name: (p.agentName as string) || 'Agent', type: 'agent' },
    resource: { type: 'agent-execution', id: p.executionId as string, name: (p.agentName as string) || 'Agent' },
    message: `${(p.agentName as string) || 'Agent'} started ${(p.task as string) || 'task'}`,
  }),
  'agent:completed': (p) => ({
    category: 'agent',
    type: 'agent.completed',
    actor: { id: p.agentId as string, name: (p.agentName as string) || 'Agent', type: 'agent' },
    resource: { type: 'agent-execution', id: p.executionId as string, name: (p.agentName as string) || 'Agent' },
    message: `${(p.agentName as string) || 'Agent'} completed`,
    metadata: { duration: p.duration, artifactId: p.artifactId },
  }),
  'conversation:session.started': (p) => ({
    category: 'conversation',
    type: 'conversation.started',
    actor: { id: (p.userId as string) || 'local', name: 'User', type: 'user' },
    resource: { type: 'session', id: p.sessionId as string, name: 'Conversation Session' },
    message: p.isFirstBoot ? 'Welcome! First conversation started' : 'Conversation resumed',
  }),
  'user:profile.created': (p) => ({
    category: 'profile',
    type: 'user.profile.created',
    actor: { id: (p.userId as string) || 'local', name: (p.userName as string) || 'User', type: 'user' },
    resource: { type: 'profile', id: p.profileId as string, name: (p.userName as string) || 'User Profile' },
    message: `Profile created for ${(p.userName as string) || 'user'}`,
  }),
  'user:profile.updated': (p) => ({
    category: 'profile',
    type: 'user.profile.updated',
    actor: { id: (p.userId as string) || 'local', name: (p.userName as string) || 'User', type: 'user' },
    resource: { type: 'profile', id: p.profileId as string, name: (p.userName as string) || 'User Profile' },
    message: `Profile updated: ${(p.field as string) || 'unknown field'}`,
  }),
  'memory:indexed': (p) => ({
    category: 'memory',
    type: 'memory.indexed',
    actor: SYSTEM_ACTOR,
    resource: { type: 'memory', id: (p.source as string) || 'unknown', name: 'Memory' },
    message: `Memory indexed: ${(p.source as string) || 'unknown source'}`,
  }),
};

export type EventEmitFn = (event: WorkspaceEvent) => void;

export class ActivityService {
  readonly id = 'vestara-activity';
  private store: ActivityLogStore;
  private eventBus?: EventBus;
  private logger?: Logger;
  private subscribers = new Set<EventEmitFn>();
  private unsubscribers: Unsubscribe[] = [];

  constructor(options: { store: ActivityLogStore; eventBus?: EventBus; logger?: Logger }) {
    this.store = options.store;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child({ component: 'activity-service' });
  }

  start(): void {
    if (!this.eventBus) return;

    const patterns = Object.keys(EVENT_MAP);
    for (const pattern of patterns) {
      try {
        const unsub = this.eventBus.subscribe(pattern, async (event: VestaraEvent) => {
          await this._handleEvent(event);
        });
        this.unsubscribers.push(unsub);
      } catch {
        this.logger?.warn('Failed to subscribe to event pattern', { pattern });
      }
    }

    this.logger?.info('Activity service started', { eventPatterns: patterns.length });
  }

  stop(): void {
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch {}
    }
    this.unsubscribers = [];
  }

  onEvent(fn: EventEmitFn): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async query(options?: {
    category?: string;
    type?: string;
    limit?: number;
    before?: string;
  }): Promise<WorkspaceEvent[]> {
    return this.store.query(options);
  }

  async emitDirect(event: WorkspaceEvent): Promise<void> {
    await this.store.append(event);
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {}
    }
  }

  private async _handleEvent(event: VestaraEvent): Promise<void> {
    const builder = EVENT_MAP[event.type];
    if (!builder) return;

    const partial = builder(event.payload as Record<string, unknown>);
    const category = partial.category ?? categorizeEvent(event.type);

    const domainEvent: WorkspaceEvent = {
      id: event.id,
      timestamp: event.timestamp,
      category,
      type: (partial.type ?? event.type) as any,
      actor: partial.actor ?? SYSTEM_ACTOR,
      resource: partial.resource ?? { type: 'unknown', id: 'unknown', name: 'Unknown' },
      message: partial.message ?? event.type,
      metadata: { ...(partial.metadata ?? {}), ...event.metadata },
    };

    await this.store.append(domainEvent);

    for (const fn of this.subscribers) {
      try {
        fn(domainEvent);
      } catch {}
    }
  }
}
