export * from './bus/EventBus';
export * from './catalog/index';
export * from './envelope/envelope';
export * from './factory/createEvent';

export type EventCategory =
  | 'conversation'
  | 'workspace'
  | 'planning'
  | 'implementation'
  | 'verification'
  | 'collaboration'
  | 'system'
  | 'agent'
  | 'memory'
  | 'profile';

export type WorkspaceEventActorType = 'user' | 'agent' | 'system';

export interface WorkspaceEventActor {
  id: string;
  name: string;
  type: WorkspaceEventActorType;
}

export interface WorkspaceEventResource {
  type: string;
  id: string;
  name: string;
}

export type WorkspaceEventType =
  | 'session.created'
  | 'session.updated'
  | 'conversation.started'
  | 'conversation.listening'
  | 'conversation.transcribed'
  | 'conversation.intent.detected'
  | 'conversation.response.started'
  | 'conversation.response.completed'
  | 'conversation.speaking'
  | 'conversation.finished'
  | 'workspace.opened'
  | 'workspace.indexed'
  | 'workspace.updated'
  | 'plan.created'
  | 'plan.approved'
  | 'plan.completed'
  | 'plan.cancelled'
  | 'changeset.created'
  | 'changeset.applied'
  | 'verification.started'
  | 'verification.completed'
  | 'collab.submitted'
  | 'collab.approved'
  | 'collab.rejected'
  | 'agent.started'
  | 'agent.completed'
  | 'memory.indexed'
  | 'memory.queried'
  | 'user.profile.created'
  | 'user.profile.updated'
  | 'system.heartbeat'
  | 'system.ready'
  | 'system.error'
  | (string & {});

export interface WorkspaceEvent {
  id: string;
  timestamp: string;
  category: EventCategory;
  type: WorkspaceEventType;
  actor: WorkspaceEventActor;
  resource: WorkspaceEventResource;
  message: string;
  metadata: Record<string, unknown>;
}

export interface WsClientMessage {
  op: 'subscribe' | 'unsubscribe' | 'ping';
  channels?: string[];
}

export interface WsServerMessage {
  op: 'event' | 'subscribed' | 'pong' | 'error' | 'activity:history';
  event?: WorkspaceEvent;
  events?: WorkspaceEvent[];
  channels?: string[];
  error?: string;
  cursor?: string;
}

export const WORKSPACE_EVENT_CHANNELS = [
  'workspace',
  'sessions',
  'agents',
  'artifacts',
  'approvals',
  'activity',
] as const;

export type WorkspaceEventChannel = (typeof WORKSPACE_EVENT_CHANNELS)[number];

export const DOMAIN_EVENT_CATEGORIES: Record<string, EventCategory> = {
  'conversation.started': 'conversation',
  'conversation.listening': 'conversation',
  'conversation.transcribed': 'conversation',
  'conversation.intent.detected': 'conversation',
  'conversation.response.started': 'conversation',
  'conversation.response.completed': 'conversation',
  'conversation.speaking': 'conversation',
  'conversation.finished': 'conversation',
  'workspace.opened': 'workspace',
  'workspace.indexed': 'workspace',
  'workspace.updated': 'workspace',
  'plan.created': 'planning',
  'plan.approved': 'planning',
  'plan.completed': 'planning',
  'plan.cancelled': 'planning',
  'changeset.created': 'implementation',
  'changeset.applied': 'implementation',
  'verification.started': 'verification',
  'verification.completed': 'verification',
  'collab.submitted': 'collaboration',
  'collab.approved': 'collaboration',
  'collab.rejected': 'collaboration',
  'agent.started': 'agent',
  'agent.completed': 'agent',
  'memory.indexed': 'memory',
  'memory.queried': 'memory',
  'user.profile.created': 'profile',
  'user.profile.updated': 'profile',
};

export function categorizeEvent(type: string): EventCategory {
  return DOMAIN_EVENT_CATEGORIES[type] ?? 'system';
}
