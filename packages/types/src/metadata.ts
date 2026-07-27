import type { JsonRecord, Timestamp } from './common';

export interface Actor {
  id: string;
  type: 'user' | 'system' | 'agent' | 'worker';
  name?: string;
  email?: string;
}

export interface ResourceRef {
  type: string;
  id: string;
  name?: string;
}

export interface AuditEntry {
  id: string;
  actor: Actor;
  action: string;
  target: ResourceRef;
  timestamp: Timestamp;
  details?: JsonRecord;
  success: boolean;
}

export interface Annotation {
  key: string;
  value: string;
  source: string;
  timestamp: Timestamp;
}

export interface Tag {
  key: string;
  value: string;
}

export interface Label {
  name: string;
  color?: string;
  description?: string;
}
