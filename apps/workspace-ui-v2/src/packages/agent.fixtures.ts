// Agent Workforce fixture — canonical v1 roster + mesh headcount.
// Source of truth: CANONICAL_AGENTS in packages/workspace/src/agents.registry.ts
// (single source; this fixture mirrors it so the standalone Vite shell renders
// the current v1 agents offline — live API status overlays it when reachable).
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

import type { LiveAgent } from '../lib/agents';

export const AGENT_NAMES = [
  'Context',
  'Analyst',
  'Developer',
  'Planner',
  'Architect',
  'Reviewer',
  'Verifier',
  'Assistant',
  'Browser',
  'System',
] as const;

export const AGENT_ACTIVE_COUNT = 10;

/** Canonical v1 roster — mirrors the registry ids/roles for live merge. */
export const AGENT_WORKFORCE_FIXTURE: LiveAgent[] = [
  { id: 'agent-context', name: 'Context', role: 'context', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-analyst', name: 'Analyst', role: 'analyst', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-developer', name: 'Developer', role: 'developer', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-planner', name: 'Planner', role: 'planning', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-architect', name: 'Architect', role: 'architect', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-reviewer', name: 'Reviewer', role: 'reviewer', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-verifier', name: 'Verifier', role: 'verifier', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-assistant', name: 'Assistant', role: 'assistant', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-browser', name: 'Browser', role: 'custom', status: 'active', provider: '', model: 'unknown' },
  { id: 'agent-system', name: 'System', role: 'system', status: 'active', provider: '', model: 'unknown' },
];

export const AGENT_WORKFORCE_OFFLINE_NOTE = 'API unreachable — showing the canonical v1 roster. Sign in to go live.';
