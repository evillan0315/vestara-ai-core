export type AgentType = 'workspace' | 'registry';

export interface Agent {
  id: string;
  name: string;
  role: string;
  agentType: AgentType;
  description?: string;
  capabilities: string[];
  permissions: any[];
  provider?: string;
  model?: string;
  teamId?: string;
  color?: string;
  status: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  leaderAgentId?: string;
  memberIds: string[];
  sharedContext?: string;
  createdAt: string;
}

export interface Execution {
  id: string;
  agentId: string;
  task: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: string;
}
