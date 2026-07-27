import type { JsonRecord, Timestamp } from './common';
import type { IntentId, JobId } from './ids';

export type IntentStatus = 'submitted' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'paused';

export type IntentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Constraint {
  type: string;
  value: JsonRecord;
  description?: string;
}

export interface SuccessCriterion {
  id: string;
  description: string;
  measurable: boolean;
  met: boolean;
}

export interface ExecutionPlan {
  jobs: JobId[];
  dependencies: Array<{ from: JobId; to: JobId }>;
  estimatedDuration: number;
  owner: string;
  approved: boolean;
}

export interface IntentInfo {
  id: IntentId;
  goal: string;
  constraints: Constraint[];
  successCriteria: SuccessCriterion[];
  plan: ExecutionPlan | null;
  status: IntentStatus;
  priority: IntentPriority;
  owner: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
}
