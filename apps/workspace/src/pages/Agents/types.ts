export type AgentType = 'workspace' | 'registry';

/** GA-4: Ownership origin — 'system' for canonical agents, 'user' for user-created. */
export type AgentOrigin = 'system' | 'user';

export interface Agent {
  id: string;
  name: string;
  role: string;
  agentType: AgentType;
  /** GA-4: Ownership origin — 'system' for canonical agents, 'user' for user-created. */
  origin?: AgentOrigin;
  description?: string;
  capabilities: string[];
  permissions: any[];
  provider?: string;
  model?: string;
  /** Native OpenCode runtime agent (e.g. build/planner/reviewer) this agent maps to. */
  runtimeAgent?: string;
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

export interface ExecutionSummary {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
}

export interface AgentStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  avgDuration: number;
}

export interface HarnessSessionEntry {
  id: string;
  workflowId?: string;
  goal?: string;
  status: string;
  createdAt: string;
}
