/**
 * Agent swimlanes — group the workflow stages by owning agent into
 * time-ordered lanes (Planner ●━━━, Developer ●━━━━━✓, Verifier ●━━━✓, …).
 * The global lifecycle rail remains the shared spine; lanes show who did what,
 * in what order.
 */

import type {
  WorkflowAgentProjection,
  WorkflowStageProjection,
  WorkflowSwimlane,
  WorkflowSwimlaneSegment,
} from './types';

/** Role ordering for lane display (unknown roles sort last). */
const ROLE_ORDER = ['conversation', 'analyst', 'planner', 'architect', 'developer', 'verifier', 'reviewer', 'system'];

function roleRank(agentId: string): number {
  const key = agentId.toLowerCase().replace(/[^a-z]/g, '');
  const index = ROLE_ORDER.findIndex((role) => key.includes(role));
  return index === -1 ? ROLE_ORDER.length : index;
}

export function deriveSwimlanes(
  stages: readonly WorkflowStageProjection[],
  agents: readonly WorkflowAgentProjection[],
): WorkflowSwimlane[] {
  interface MutableLane {
    agentId: string;
    agentName: string;
    segments: WorkflowSwimlaneSegment[];
  }
  const lanes = new Map<string, MutableLane>();
  const nameByAgent = new Map(agents.map((agent) => [agent.id, agent.name]));

  // Only stages that actually ran produce a lane segment.
  for (const stage of stages) {
    if (!stage.agentId || !stage.startedAt) continue;
    const lane = lanes.get(stage.agentId) ?? {
      agentId: stage.agentId,
      agentName: nameByAgent.get(stage.agentId) ?? stage.agentId,
      segments: [],
    };
    lane.segments.push({
      stageId: stage.id,
      status: stage.status,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
      durationMs: stage.durationMs,
      tools: stage.tools,
      files: stage.files,
      evidenceCount: stage.evidenceCount,
    });
    lanes.set(stage.agentId, lane);
  }

  return [...lanes.values()]
    .sort((left, right) => roleRank(left.agentId) - roleRank(right.agentId))
    .map((lane) => ({ ...lane }));
}
