/**
 * Agent Harness API client + types.
 *
 * Mirrors apps/api/src/routes/agent-harness.ts and @vestara/agent-harness.
 * The harness is the durable agent execution path: POST /runs returns
 * identifiers immediately while progress flows through thread items and the
 * engineering event store.
 */

export interface CreateRunResponse {
  threadId: string;
  turnId?: string;
  runId: string;
  state: string;
  sessionId?: string;
}

export interface ThreadSnapshot {
  threadId: string;
  turnId?: string;
  runId: string;
  state: string;
  sessionId?: string;
  session?: { id?: string; status?: string; workflowId?: string };
}

export interface ThreadItem {
  id: string;
  threadId: string;
  turnId: string;
  sequence: number;
  kind: string;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  correlationId: string;
  causationId?: string;
}

export interface ThreadReplay {
  thread: { id: string; taskId: string; title: string; status: string; createdAt: string };
  turns: Array<{
    id: string;
    state: string;
    input: string;
    startedAt: string;
    completedAt?: string;
    outcome?: { state: string; summary: string; reasonCode?: string };
  }>;
  items: ThreadItem[];
}

export interface PendingApproval {
  approvalId: string;
  threadId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  requestedAt: string;
  risk: string;
  reason: string;
  affectedResources: string[];
}

export interface EngineeringTruthEvent {
  id: string;
  seq: number;
  at: string;
  type: string;
  source: string;
  actorId: string;
  threadId?: string;
  turnId?: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface ResolveApprovalResponse {
  thread: { id: string; status: string };
  turn: { id: string; state: string; outcome?: { state: string; summary: string; reasonCode?: string } };
  outcome?: { state: string; summary: string; reasonCode?: string };
  approvalId?: string;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function threadThreadId(threadId: string): string {
  return encodeURIComponent(threadId);
}

export const harnessApi = {
  createRun: (agentId: string, input: { instruction: string; title?: string; taskId?: string; environment?: Record<string, unknown> }) =>
    fetchJSON<CreateRunResponse>(`/api/agents/${encodeURIComponent(agentId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  threads: () => fetchJSON<{ threads: Array<{ id: string; taskId: string; title: string; status: string; createdAt: string }> }>('/api/agent-threads'),

  thread: (threadId: string) => fetchJSON<ThreadSnapshot & { thread?: Record<string, unknown> }>(`/api/agent-threads/${threadThreadId(threadId)}`),

  items: (threadId: string) => fetchJSON<ThreadReplay>(`/api/agent-threads/${threadThreadId(threadId)}/items`),

  events: (threadId: string) => fetchJSON<{ events: EngineeringTruthEvent[] }>(`/api/agent-threads/${threadThreadId(threadId)}/events`),

  approvals: (threadId: string) => fetchJSON<{ approvals: PendingApproval[] }>(`/api/agent-threads/${threadThreadId(threadId)}/approvals`),

  resolveApproval: (threadId: string, approvalId: string, approved: boolean) =>
    fetchJSON<ResolveApprovalResponse>(`/api/agent-threads/${threadThreadId(threadId)}/approvals/${encodeURIComponent(approvalId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),

  steer: (threadId: string, message: string) =>
    fetchJSON<{ item: ThreadItem }>(`/api/agent-threads/${threadThreadId(threadId)}/steer`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  cancel: (threadId: string, reason?: string) =>
    fetchJSON<{ turn: { id: string; state: string } }>(`/api/agent-threads/${threadThreadId(threadId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resume: (threadId: string, environment?: Record<string, unknown>) =>
    fetchJSON<ResolveApprovalResponse>(`/api/agent-threads/${threadThreadId(threadId)}/resume`, {
      method: 'POST',
      body: JSON.stringify({ environment }),
    }),
};

export function threadIdFromSession(workflowId?: string): string | null {
  if (!workflowId?.startsWith('thread:')) return null;
  return workflowId.slice('thread:'.length);
}
