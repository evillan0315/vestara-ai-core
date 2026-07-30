export interface Plan {
  id: string; title: string; status: string; goal?: string;
  tasks?: Array<{ description: string; status: string }>;
  sessionId?: string; createdAt: string;
}

export interface ChangeSet {
  id: string; planId: string; status: string; files?: string[];
  sessionId?: string; createdAt: string;
}

export interface CollabRecord {
  id: string; changeSetId: string; status: string; title?: string;
  sessionId?: string; createdAt: string;
}

export interface Verification {
  id: string; changeSetId: string; status: string;
  checks?: Array<{ name: string; status: string }>;
  passed?: number; failed?: number; sessionId?: string; createdAt: string;
}

export interface ExecSession {
  id: string; goal: string; status: string; workflowId?: string;
  timeline?: any[]; metrics?: any; createdAt: string;
}
