/**
 * HarnessSession — narrow orchestration and projection layer connecting
 * ExecutionSession records to durable harness threads.
 *
 * HarnessSession NEVER runs an execution loop. It only:
 *   • associates a harness thread with an ExecutionSession;
 *   • projects thread replay into the session timeline/metrics/status;
 *   • exposes pending approvals;
 *   • restores active sessions after a restart;
 *   • maps terminal harness outcomes to session state.
 *
 * The Phase-1 compatibility adapter (`HarnessExecutionAdapter`) maps the
 * AgentRuntime execution contract onto AgentHarnessRuntime for existing
 * callers. It is non-destructive: the legacy orchestrator remains untouched
 * until the migration default flips and the duplicate loop is removed.
 */

import type { AgentExecutionEngine, AgentHarnessRuntime, PendingApproval } from '@vestara/agent-harness';
import type { ThreadReplay } from '@vestara/thread-runtime';
import type { AgentEnvironment, TaskThreadId } from '@vestara/types';
import type { AgentStorage } from './agent-storage';
import type { ExecutionSession } from './types';

const THREAD_LINK_PREFIX = 'thread:';

export interface HarnessSessionOptions {
  readonly harness: AgentHarnessRuntime;
  readonly storage: AgentStorage;
  readonly environment: AgentEnvironment;
}

export interface HarnessRunRecord {
  readonly sessionId: string;
  readonly threadId: string;
  readonly agentId: string;
  readonly runId: string;
  readonly goal: string;
}

// ─── Phase-1 adapter contract ─────────────────────────────────

export interface AgentExecutionRequest {
  readonly agentId: string;
  readonly instruction: string;
  readonly goal?: string;
  readonly context?: string;
  readonly sessionId?: string;
}

export interface AgentExecutionResult {
  readonly threadId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly status: 'completed' | 'blocked' | 'failed' | 'cancelled';
  readonly output?: string;
}

let sessionCounter = 0;

function terminalSessionStatus(state: string): ExecutionSession['status'] | null {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'blocked':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

export class HarnessSession {
  constructor(protected readonly options: HarnessSessionOptions) {}

  get harness(): AgentHarnessRuntime {
    return this.options.harness;
  }

  get environment(): AgentEnvironment {
    return this.options.environment;
  }

  /** Create an ExecutionSession row durably linked to a harness thread. */
  async createForRun(input: { threadId: string; goal: string; agentId: string }): Promise<HarnessRunRecord> {
    const snapshot = this.options.harness.snapshot(input.threadId as TaskThreadId);
    const now = new Date().toISOString();
    const sessionId = `session-${Date.now()}-${++sessionCounter}`;
    const session: ExecutionSession = {
      id: sessionId,
      goal: input.goal,
      workflowId: `${THREAD_LINK_PREFIX}${input.threadId}`,
      assignedAgentIds: [input.agentId],
      planIds: [],
      changeSetIds: [],
      verificationIds: [],
      logs: [],
      timeline: [],
      approvals: [],
      metrics: { duration: 0, totalSteps: 0, completedSteps: 0, artifactCount: 0 },
      status: 'running',
      createdAt: now,
    };
    await this.options.storage.saveExecutionSession(session);
    return {
      sessionId,
      threadId: input.threadId,
      agentId: input.agentId,
      runId: snapshot.runId,
      goal: input.goal,
    };
  }

  /** Re-link and sync any active harness threads after a restart. */
  async restoreActiveSessions(): Promise<HarnessRunRecord[]> {
    if (process.env.VESTARA_SKIP_SESSION_RESTORE === '1') {
      return [];
    }
    const records: HarnessRunRecord[] = [];
    for (const thread of this.options.harness.listThreads()) {
      const agentId = String(thread.metadata?.agentId ?? 'agent');
      const goal = thread.title;
      const existing = await this.sessionForThread(thread.id);
      let record: HarnessRunRecord;
      if (existing) {
        const snapshot = this.options.harness.snapshot(thread.id);
        record = { sessionId: existing.id, threadId: thread.id, agentId, runId: snapshot.runId, goal: existing.goal };
      } else {
        record = await this.createForRun({ threadId: thread.id, goal, agentId });
      }
      await this.syncFromReplay(thread.id);
      records.push(record);
    }
    return records;
  }

  async sessionForThread(threadId: string): Promise<ExecutionSession | null> {
    const sessions = await this.options.storage.listExecutionSessions(1_000);
    return sessions.find((session) => session.workflowId === `${THREAD_LINK_PREFIX}${threadId}`) ?? null;
  }

  async threadIdForSession(sessionId: string): Promise<string | null> {
    const session = await this.options.storage.getExecutionSession(sessionId);
    if (!session?.workflowId?.startsWith(THREAD_LINK_PREFIX)) return null;
    return session.workflowId.slice(THREAD_LINK_PREFIX.length);
  }

  /** Project a harness thread replay into the linked ExecutionSession. */
  async syncFromReplay(threadId: string): Promise<ExecutionSession | null> {
    const replay = this.options.harness.replay(threadId as TaskThreadId);
    const session = await this.sessionForThread(threadId);
    if (!session) return null;
    const updated = this.project(replay, session);
    await this.options.storage.saveExecutionSession(updated);
    return updated;
  }

  async pendingApprovalsForSession(sessionId: string): Promise<readonly PendingApproval[]> {
    const threadId = await this.threadIdForSession(sessionId);
    if (!threadId) return [];
    return this.options.harness.pendingApprovals(threadId);
  }

  // ─── Projection (no execution here) ─────────────────────────

  private project(replay: ThreadReplay, session: ExecutionSession): ExecutionSession {
    const turn = replay.turns.at(-1);
    const state = turn?.state ?? 'queued';
    const timeline: ExecutionSession['timeline'] = [];
    const approvals: ExecutionSession['approvals'] = [];
    const verificationIds: string[] = [];
    let toolCalls = 0;
    let toolResults = 0;
    let artifactCount = 0;

    for (const item of replay.items) {
      const payload = item.payload as {
        toolName?: unknown;
        status?: unknown;
        step?: unknown;
        state?: unknown;
        approvalId?: unknown;
        approved?: unknown;
        decision?: unknown;
        agentId?: unknown;
        evidence?: readonly { id?: string }[];
      };
      const agentId = String(payload.agentId ?? session.assignedAgentIds[0] ?? 'agent');
      switch (item.kind) {
        case 'tool-call':
          toolCalls += 1;
          timeline.push({
            step: `tool:${String(payload.toolName ?? '')}`,
            agentId,
            status: 'running',
            timestamp: item.createdAt,
          });
          break;
        case 'tool-result': {
          toolResults += 1;
          artifactCount += (payload.evidence ?? []).length;
          const resultStatus = payload.status === 'completed' ? 'completed' : 'failed';
          timeline.push({
            step: `tool:${String(payload.toolName ?? '')}`,
            agentId,
            status: resultStatus,
            timestamp: item.createdAt,
          });
          break;
        }
        case 'approval-request':
          timeline.push({ step: 'approval-requested', agentId, status: 'pending', timestamp: item.createdAt });
          break;
        case 'approval-decision': {
          const approved = payload.approved === true || payload.decision === 'approved';
          approvals.push({ agentId, approved, reason: approved ? 'approved' : 'rejected', timestamp: item.createdAt });
          break;
        }
        case 'verification-result':
          verificationIds.push(`verification:${item.id}`);
          timeline.push({
            step: 'verification',
            agentId: 'verifier',
            status: payload.status === 'passed' ? 'completed' : 'failed',
            timestamp: item.createdAt,
          });
          break;
        case 'final-outcome':
          timeline.push({ step: 'final', agentId, status: String(payload.state ?? state), timestamp: item.createdAt });
          break;
        case 'user-message':
        case 'steering-message':
          timeline.push({ step: item.kind, agentId, status: 'completed', timestamp: item.createdAt });
          break;
        default:
          break;
      }
    }

    const started = new Date(session.createdAt).getTime();
    const ended = turn?.completedAt ? new Date(turn.completedAt).getTime() : Date.now();
    const terminal = terminalSessionStatus(state);

    return {
      ...session,
      timeline,
      approvals,
      verificationIds: [...new Set([...session.verificationIds, ...verificationIds])],
      metrics: {
        duration: Number.isFinite(ended - started) ? Math.max(0, ended - started) : 0,
        totalSteps: Math.max(toolCalls, timeline.length),
        completedSteps: toolResults,
        artifactCount,
      },
      status: terminal ?? 'running',
      completedAt: terminal ? (turn?.completedAt ?? new Date().toISOString()) : session.completedAt,
    };
  }
}

// ─── Phase-1 compatibility adapter ────────────────────────────

/**
 * Adapts the AgentRuntime execution contract onto AgentHarnessRuntime. Runs a
 * single durable harness turn, projects it into an ExecutionSession, and
 * converts the outcome for existing callers. Used by the dual-path validation
 * and the migration default; the legacy orchestrator is untouched.
 */
export class HarnessExecutionAdapter {
  constructor(private readonly session: HarnessSession) {}

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const thread = this.session.harness.createThread({
      taskId: `task-${Date.now()}`,
      title: request.goal ?? request.instruction.slice(0, 120),
      environment: this.session.environment,
      metadata: { agentId: request.agentId, runSource: 'agent-runtime-adapter' },
    });
    const record = await this.session.createForRun({
      threadId: thread.id,
      goal: request.goal ?? request.instruction,
      agentId: request.agentId,
    });
    const result = await this.session.harness.run({
      threadId: thread.id,
      instruction: request.instruction,
      agentId: request.agentId,
      environment: this.session.environment,
    });
    const _session = await this.session.syncFromReplay(thread.id);
    const state = result.turn.state;
    const terminal: AgentExecutionResult['status'] =
      state === 'completed' || state === 'failed' || state === 'blocked' || state === 'cancelled' ? state : 'failed';
    return {
      threadId: thread.id,
      turnId: result.turn.id,
      runId: record.runId || this.session.harness.snapshot(thread.id).runId,
      status: terminal,
      output: lastModelResponse(this.session.harness, thread.id) ?? result.turn.outcome?.summary,
    };
  }
}

/**
 * The model's actual final answer is stored as the last `model-response` item
 * on the harness thread (the timeline `step` is only a label like "final").
 */
function lastModelResponse(harness: AgentHarnessRuntime, threadId: string): string | undefined {
  const items = harness.replay(threadId as TaskThreadId).items;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.kind !== 'model-response') continue;
    const content = (item.payload as { content?: unknown }).content;
    if (typeof content === 'string' && content.trim().length > 0) return content;
  }
  return undefined;
}

export type { AgentExecutionEngine };
