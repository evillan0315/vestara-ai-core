/**
 * Agent catalog fixtures — typed local mock data for catalog tests and
 * offline preview. Never inline agent arrays in JSX; import from here.
 */
import type { Agent, Execution } from './types';

export const CATALOG_AGENTS_FIXTURE: Agent[] = [
  {
    id: 'agent-system-1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    origin: 'system',
    description: 'Plans work',
    capabilities: ['planning'],
    permissions: [],
    status: 'active',
    createdAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'agent-user-1',
    name: 'My Helper',
    role: 'developer',
    agentType: 'registry',
    origin: 'user',
    description: 'Custom helper',
    capabilities: ['coding', 'review'],
    permissions: [],
    status: 'active',
    createdAt: '2026-10-21T00:00:00.000Z',
  },
  {
    id: 'agent-system-2',
    name: 'Reviewer',
    role: 'reviewer',
    agentType: 'workspace',
    origin: 'system',
    description: 'Reviews work',
    capabilities: [],
    permissions: [],
    status: 'disabled',
    createdAt: '2026-10-22T00:00:00.000Z',
  },
];

export const CATALOG_EXECUTIONS_FIXTURE: Execution[] = [
  {
    id: 'exec-1',
    agentId: 'agent-system-1',
    task: 'Plan the release',
    status: 'completed',
    startedAt: '2026-10-23T00:00:00.000Z',
    completedAt: '2026-10-23T00:01:00.000Z',
  },
  {
    id: 'exec-2',
    agentId: 'agent-user-1',
    task: 'Fix the bug',
    status: 'running',
    startedAt: '2026-10-24T00:00:00.000Z',
  },
];
