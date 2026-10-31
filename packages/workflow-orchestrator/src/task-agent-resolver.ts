/**
 * Task → agent resolution for orchestration workflow nodes.
 *
 * Maps a task's `requiredCapabilities` to the canonical Vestara agent id
 * that owns it, so every orchestrated task node carries real agent
 * attribution (graph projection, snapshot participants, Activity Room
 * addressing) instead of falling back to placeholder ids.
 *
 * Boundary note: the canonical capability table lives in
 * `packages/workspace/src/agents.registry.ts`, but this package must not
 * depend on `@vestara/workspace` (monorepo boundary rule), so the table is
 * mirrored here. Keep the two in sync: agent ids, modes (primary vs
 * subagent), and capability lists. `pnpm agents:sync` remains the renderer
 * authority; this file is the orchestration routing authority.
 */

/** Canonical agent id plus the capabilities it owns (mirrors the registry). */
interface AgentCapabilityEntry {
  readonly agentId: string;
  /** Primary agents take workflow stages directly; subagents spawn via task. */
  readonly mode: 'primary' | 'subagent';
  readonly capabilities: readonly string[];
}

const AGENT_CAPABILITIES: readonly AgentCapabilityEntry[] = [
  {
    agentId: 'agent-context',
    mode: 'primary',
    capabilities: ['architecture-analysis', 'dependency-analysis', 'summarization', 'knowledge-management'],
  },
  {
    agentId: 'agent-analyst',
    mode: 'primary',
    capabilities: [
      'dependency-analysis',
      'diagnostics',
      'quality-analysis',
      'summarization',
      'knowledge-management',
      'feature-detection',
    ],
  },
  {
    agentId: 'agent-planner',
    mode: 'primary',
    capabilities: ['planning', 'dependency-analysis', 'architecture-analysis', 'summarization', 'knowledge-management'],
  },
  {
    agentId: 'agent-architect',
    mode: 'primary',
    capabilities: [
      'architecture-analysis',
      'dependency-analysis',
      'design-review',
      'planning',
      'database-design',
      'security-analysis',
    ],
  },
  {
    agentId: 'agent-developer',
    mode: 'primary',
    capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
  },
  {
    agentId: 'agent-verifier',
    mode: 'subagent',
    capabilities: ['testing', 'diagnostics', 'quality-analysis'],
  },
  {
    agentId: 'agent-reviewer',
    mode: 'subagent',
    capabilities: ['design-review', 'quality-analysis', 'testing'],
  },
  {
    agentId: 'agent-system',
    mode: 'primary',
    capabilities: [
      'governance',
      'progress-tracking',
      'milestone-management',
      'quality-analysis',
      'knowledge-management',
    ],
  },
  {
    agentId: 'agent-assistant',
    mode: 'primary',
    capabilities: [
      'conversation',
      'summarization',
      'knowledge-management',
      'documentation',
      'architecture-analysis',
      'dependency-analysis',
    ],
  },
  {
    agentId: 'agent-browser',
    mode: 'subagent',
    capabilities: ['web-navigation', 'web-observation', 'web-interaction', 'web-research'],
  },
];

/**
 * Resolve the owning canonical agent for a task's required capabilities.
 *
 * Scoring mirrors the harness dispatcher: the agent matching the most
 * required capabilities wins. Ties break toward the most specialized agent
 * (fewest total capabilities), then toward the earlier pipeline stage
 * (context → analyst → planner → architect → developer → verifier →
 * reviewer → system, then assistant, browser), which keeps plan-shaped
 * tasks with their planning-stage owner. Returns undefined when nothing
 * matches, so callers keep their existing fallback instead of guessing.
 */
export function resolveTaskAgentId(requiredCapabilities: readonly string[]): string | undefined {
  if (requiredCapabilities.length === 0) return undefined;
  let best: { agentId: string; score: number; total: number } | undefined;
  for (const agent of AGENT_CAPABILITIES) {
    const score = requiredCapabilities.filter((capability) => agent.capabilities.includes(capability)).length;
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && agent.capabilities.length < best.total)) {
      best = { agentId: agent.agentId, score, total: agent.capabilities.length };
    }
  }
  return best?.agentId;
}
