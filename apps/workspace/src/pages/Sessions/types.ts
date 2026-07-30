export interface ExecutionSession {
  id: string;
  goal: string;
  status: string;
  workflowId?: string;
  createdAt: string;
  completedAt?: string;
  assignedAgentIds?: string[];
  planIds?: string[];
  changeSetIds?: string[];
  verificationIds?: string[];
  timeline?: Array<{
    agentId: string;
    step: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  metrics?: {
    totalSteps: number;
    completedSteps: number;
    agentCount?: number;
    artifactCount?: number;
    duration?: number;
  };
}
