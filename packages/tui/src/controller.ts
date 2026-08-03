import { isConversationChunk } from '@vestara/tui-protocol';
import type { RawData } from 'ws';
import WebSocket from 'ws';
import { normalizeRuntimeEvent } from './normalize.js';
import type {
  AgentCard,
  HarnessTaskSnapshot,
  HarnessThreadSummary,
  PlanSummary,
  RoutingAgent,
  RoutingCandidate,
  RoutingSelection,
  SessionSummary,
  TuiEvent,
  TuiSnapshot,
  WorkflowProjectionSummary,
} from './types.js';

export interface TuiControllerOptions {
  endpoint?: string;
}

export class TuiController {
  private readonly endpoint: URL;
  private routingState?: RoutingSelection;
  private workflowFollow?: { threadId: string; lastPush: number };
  private conversationId?: string;
  constructor(options: TuiControllerOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001');
  }

  async connect(listener: (event: TuiEvent) => void): Promise<() => void> {
    listener({ type: 'connection', state: 'connecting' });
    try {
      const [status, workspace, telemetry, graph, plans, sessions, agents, catalog, selection, providers] =
        await Promise.all([
          this.getJson<{ status: string; workspaceId: string; runtimeVersion: string; apiEndpoint: string }>(
            '/api/runtime/status',
          ),
          this.getJson<any>('/api/workspace'),
          this.getJson<{ agents?: AgentCard[] }>('/api/telemetry/agents').catch(() => ({ agents: [] })),
          this.getJson<{ entities?: Array<{ id: string; kind: string; label: string; status?: string }> }>(
            '/api/graph/entities?limit=100',
          ).catch(() => ({ entities: [] })),
          this.getJson<{ plans?: any[] }>('/api/plans').catch(() => ({ plans: [] })),
          this.getJson<{ sessions?: any[] }>('/api/sessions').catch(() => ({ sessions: [] })),
          this.getJson<{ agents?: RoutingAgent[] }>('/api/agents').catch(() => ({ agents: [] })),
          this.getJson<{ candidates?: RoutingCandidate[] }>('/api/routing/catalog').catch(() => ({ candidates: [] })),
          this.getJson<any>('/api/routing/selection').catch(() => undefined),
          this.getJson<{
            providers?: Array<{ id: string; credential?: { configured: boolean; source?: string } }>;
          }>('/api/providers').catch(() => ({ providers: [] })),
        ]);
      listener({
        type: 'workspace',
        workspace: {
          id: status.workspaceId,
          name: workspace.fingerprint?.name ?? workspace.profile?.name ?? status.workspaceId,
          root: workspace.fingerprint?.rootPath ?? workspace.profile?.root,
          branch: workspace.profile?.identity?.gitBranch ?? workspace.profile?.gitBranch,
        },
      });
      for (const agent of telemetry.agents ?? []) listener({ type: 'agent', agent });
      listener({ type: 'graph', entities: graph.entities ?? [] });
      listener({
        type: 'plans',
        plans: (plans.plans ?? []).map(toPlanSummary),
      });
      listener({
        type: 'sessions',
        sessions: (sessions.sessions ?? []).map(toSessionSummary),
      });
      listener({
        type: 'files',
        files: (graph.entities ?? [])
          .filter((entity) => ['file', 'source-file'].includes(entity.kind))
          .map((entity) => ({ path: entity.label, status: entity.status })),
      });
      if (selection) {
        const availableAgents = (agents.agents ?? [])
          .filter((agent) => agent.status === 'active')
          .map(normalizeRoutingAgent)
          .filter((agent): agent is RoutingAgent => agent !== undefined);
        const routing: RoutingSelection = {
          revision: selection.revision,
          profileId: selection.selection.profileId,
          roles: selection.selection.roles ?? {},
          agents: availableAgents,
          candidates: catalog.candidates ?? [],
          activeAgentId: this.routingState?.activeAgentId ?? availableAgents[0]?.id,
          providers: Object.fromEntries(
            (providers.providers ?? []).map((provider) => [
              provider.id,
              { configured: Boolean(provider.credential?.configured), source: provider.credential?.source },
            ]),
          ),
        };
        this.routingState = routing;
        listener({ type: 'routing', routing });
      }
      listener({ type: 'connection', state: 'connected' });
      const unsubscribe = await this.subscribe((raw) => {
        for (const event of normalizeRuntimeEvent(raw)) listener(event);
        const message = raw as { type?: unknown; payload?: unknown };
        const payload =
          message?.payload && typeof message.payload === 'object'
            ? (message.payload as { threadId?: unknown })
            : undefined;
        if (message?.type === 'tui.task.updated' && payload?.threadId) {
          void this.getJson<HarnessTaskSnapshot>(
            `/api/tui/threads/${encodeURIComponent(String(payload.threadId))}/snapshot`,
          )
            .then((snapshot) => listener({ type: 'harness-task', snapshot }))
            .catch(() => {});
        }
        if (
          message?.type === 'workflow.updated' &&
          payload?.threadId &&
          this.workflowFollow?.threadId === String(payload.threadId)
        ) {
          this.workflowFollow.lastPush = Date.now();
          void this.getJson<{ projection: WorkflowProjectionSummary }>(
            `/api/workflow/${encodeURIComponent(String(payload.threadId))}`,
          )
            .then((result) => listener({ type: 'workflow', workflow: result.projection }))
            .catch(() => {});
        }
      });
      return unsubscribe;
    } catch (error) {
      listener({ type: 'connection', state: 'error', message: error instanceof Error ? error.message : String(error) });
      return () => {};
    }
  }

  async *execute(rawInput: string, signal?: AbortSignal): AsyncGenerator<TuiEvent> {
    const input = rawInput.trim();
    if (!input) return;
    const [command, ...args] = splitArguments(input.startsWith('/') ? input.slice(1) : input);
    if (command === 'exit' || command === 'quit') {
      yield { type: 'exit' };
      return;
    }
    if (command === 'clear') {
      yield { type: 'clear' };
      return;
    }
    if (command === 'status') {
      const status = await this.getJson<{ status: string; workspaceId: string; runtimeVersion: string }>(
        '/api/runtime/status',
      );
      yield {
        type: 'message',
        entry: {
          id: `status-${Date.now()}`,
          role: 'system',
          content: `Runtime ${status.status} · ${status.workspaceId} · v${status.runtimeVersion}`,
        },
      };
      return;
    }
    if (command === 'routing') {
      yield* this.routing(args);
      return;
    }
    if (command === 'exec') {
      yield* this.execution(args, signal);
      return;
    }
    if (command === 'workflow') {
      yield* this.workflow(args, signal);
      return;
    }
    if (command === 'approve' || command === 'deny') {
      yield* this.approval(command === 'approve', args);
      return;
    }
    const navigation: Record<string, TuiEvent & { type: 'navigate' }> = {
      chat: { type: 'navigate', view: 'chat' },
      sessions: { type: 'navigate', view: 'sessions' },
      plans: { type: 'navigate', view: 'plans' },
      graph: { type: 'navigate', view: 'graph' },
      explorer: { type: 'navigate', view: 'explorer' },
      logs: { type: 'navigate', view: 'logs' },
      telemetry: { type: 'navigate', view: 'telemetry' },
      execution: { type: 'navigate', view: 'execution' },
      workflow: { type: 'navigate', view: 'workflow' },
    };
    if (navigation[command]) {
      yield navigation[command];
      return;
    }
    if (command === 'help') {
      yield {
        type: 'message',
        entry: {
          id: `help-${Date.now()}`,
          role: 'system',
          content:
            'Commands: /status, /routing show, /routing select <agent> <role> <provider> <model>, /exec [threadId], /workflow <threadId>, /approve|/deny <threadId> <approvalId>, /plans, /sessions, /graph, /explorer, /telemetry, /clear, /exit',
        },
      };
      return;
    }
    yield* this.streamConversation(input, signal);
  }

  private async *approval(approved: boolean, args: string[]): AsyncGenerator<TuiEvent> {
    const [threadId, approvalId] = args;
    if (!threadId || !approvalId) throw new Error('Usage: /approve|/deny <threadId> <approvalId>');
    try {
      await this.requestJson<unknown>(
        `/api/agent-threads/${encodeURIComponent(threadId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
        'POST',
        { approved },
      );
      yield {
        type: 'notification',
        level: 'success',
        message: `Approval ${approved ? 'approved' : 'denied'}: ${approvalId}`,
      };
      const snapshot = await this.getJson<HarnessTaskSnapshot>(
        `/api/tui/threads/${encodeURIComponent(threadId)}/snapshot`,
      );
      yield { type: 'harness-task', snapshot };
    } catch (error) {
      yield {
        type: 'notification',
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async *workflow(args: string[], signal?: AbortSignal): AsyncGenerator<TuiEvent> {
    const threadId = args[0];
    if (!threadId) {
      throw new Error('Usage: /workflow <threadId>');
    }
    // Visibility-aware polling fallback: poll only when no push has arrived
    // recently (healthy WebSocket pushes keep this idle).
    this.workflowFollow = { threadId, lastPush: 0 };
    try {
      for (let iteration = 0; iteration < 600 && !signal?.aborted; iteration++) {
        if (Date.now() - this.workflowFollow.lastPush > 3000) {
          try {
            const result = await this.getJson<{ projection: WorkflowProjectionSummary }>(
              `/api/workflow/${encodeURIComponent(threadId)}`,
            );
            this.workflowFollow.lastPush = Date.now();
            yield { type: 'workflow', workflow: result.projection };
            if (['completed', 'failed', 'cancelled', 'blocked'].includes(result.projection.status)) return;
          } catch {
            /* snapshot may be momentarily unavailable */
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      if (this.workflowFollow?.threadId === threadId) this.workflowFollow = undefined;
    }
  }

  private async *execution(args: string[], signal?: AbortSignal): AsyncGenerator<TuiEvent> {
    const threads = (await this.getJson<{ threads?: HarnessThreadSummary[] }>('/api/tui/threads')).threads ?? [];
    yield { type: 'harness-threads', threads };
    const target = args[0] ?? threads[0]?.id;
    if (!target) {
      yield {
        type: 'message',
        entry: {
          id: `exec-${Date.now()}`,
          role: 'system',
          content: 'No harness threads yet. Start a run to see execution here.',
        },
      };
      return;
    }
    let latest: HarnessTaskSnapshot | undefined;
    for (let iteration = 0; iteration < 120 && !signal?.aborted; iteration++) {
      try {
        latest = await this.getJson<HarnessTaskSnapshot>(`/api/tui/threads/${encodeURIComponent(target)}/snapshot`);
        yield { type: 'harness-task', snapshot: latest };
      } catch {
        /* snapshot may be momentarily unavailable */
      }
      if (latest && ['completed', 'failed', 'blocked', 'cancelled', 'archived'].includes(latest.thread.status)) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async *routing(args: string[]): AsyncGenerator<TuiEvent> {
    const action = args[0] ?? 'show';
    if (action === 'show') {
      const result = await this.getJson<any>('/api/routing/selection');
      yield {
        type: 'message',
        entry: {
          id: `routing-${Date.now()}`,
          role: 'system',
          content: `Routing ${result.selection.profileId} · revision ${result.revision}`,
        },
      };
      return;
    }
    if (action === 'select') {
      const [agentId, role, providerId, modelId] = args.slice(1, 5);
      if (!agentId || !role || !providerId || !modelId)
        throw new Error('Usage: /routing select <agent> <role> <provider> <model>');
      if (!this.routingState) throw new Error('Routing catalog is not available');
      const agent = this.routingState.agents.find((candidate) => candidate.id === agentId && candidate.role === role);
      if (!agent) throw new Error(`Agent is not available for role ${role}: ${agentId}`);
      const candidate = this.routingState.candidates.find(
        (item) => item.ref.providerId === providerId && item.ref.modelId === modelId && item.availability.available,
      );
      if (!candidate) throw new Error(`Provider model is not available: ${providerId}/${modelId}`);
      const result = await this.requestJson<any>('/api/routing/selection', 'PATCH', {
        selection: {
          profileId: this.routingState.profileId,
          roles: { ...this.routingState.roles, [role]: candidate.ref },
        },
        expectedRevision: this.routingState.revision,
        updatedByClientId: 'console',
      });
      this.routingState = {
        ...this.routingState,
        revision: result.revision,
        profileId: result.selection.profileId,
        roles: result.selection.roles,
        activeAgentId: agentId,
      };
      yield { type: 'routing', routing: this.routingState };
      yield {
        type: 'notification',
        level: 'success',
        message: `${agent.name} → ${candidate.providerName}/${candidate.ref.modelId}`,
      };
      return;
    }
    throw new Error(`Unknown routing command: ${action}`);
  }

  async *setProviderCredential(providerId: string, apiKey: string): AsyncGenerator<TuiEvent> {
    await this.requestJson(`/api/providers/${encodeURIComponent(providerId)}/credentials`, 'POST', { apiKey });
    if (this.routingState) {
      this.routingState = {
        ...this.routingState,
        providers: {
          ...(this.routingState.providers ?? {}),
          [providerId]: { configured: true, source: 'stored' },
        },
      };
      yield { type: 'routing', routing: this.routingState };
    }
  }

  private async *streamConversation(message: string, signal?: AbortSignal): AsyncGenerator<TuiEvent> {
    const id = `assistant-${Date.now()}`;
    yield { type: 'conversation-start', id };

    // Ensure a conversation exists (create once per TUI session, then reuse).
    if (!this.conversationId) {
      const created = await this.requestJson<{ conversation: { id: string } }>('/api/conversations', 'POST', {}).catch(
        () => undefined,
      );
      this.conversationId = created?.conversation?.id;
    }
    const conversationId = this.conversationId;
    if (!conversationId) throw new Error('Unable to create a conversation');

    const response = await fetch(
      new URL(`/api/conversations/${encodeURIComponent(conversationId)}/stream`, this.endpoint),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vestara-Source': 'cli' },
        body: JSON.stringify({ message }),
        signal,
      },
    );
    if (!response.ok || !response.body) throw new Error(`Conversation stream unavailable: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((candidate) => candidate.startsWith('data: '));
        if (!line) continue;
        const parsed = JSON.parse(line.slice(6)) as unknown;
        if (!isConversationChunk(parsed)) continue;
        const event = parsed.event;
        if (event.type === 'delta' && event.content) yield { type: 'conversation-delta', id, content: event.content };
        if (event.type === 'tool_result') {
          yield {
            type: 'tool',
            card: {
              id: `tool-${Date.now()}`,
              tool: event.name ?? 'tool',
              label: event.name ?? 'Tool',
              status: 'completed',
              startedAt: parsed.timestamp,
              detail: event.content,
            },
          };
        }
        if (event.type === 'error') throw new Error(event.content ?? 'Conversation failed');
      }
    }
    yield { type: 'conversation-complete', id };
  }

  private async getJson<T>(pathname: string): Promise<T> {
    const response = await fetch(new URL(pathname, this.endpoint), { headers: { 'X-Vestara-Source': 'cli' } });
    if (!response.ok) throw new Error(`Runtime API ${response.status}: ${pathname}`);
    return response.json() as Promise<T>;
  }

  private async requestJson<T>(pathname: string, method: string, body: unknown): Promise<T> {
    const response = await fetch(new URL(pathname, this.endpoint), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Vestara-Source': 'cli' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(result.error ?? `Runtime API ${response.status}: ${pathname}`);
    }
    return response.json() as Promise<T>;
  }

  private subscribe(listener: (event: unknown) => void): Promise<() => void> {
    const endpoint = new URL('/ws', this.endpoint);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      let settled = false;
      socket.once('open', () => {
        settled = true;
        socket.send(JSON.stringify({ op: 'subscribe', channels: ['workspace'] }));
        resolve(() => socket.close());
      });
      socket.on('message', (data: RawData) => {
        try {
          const message = JSON.parse(String(data)) as { op?: string; event?: unknown };
          if (message.op === 'event' && message.event !== undefined) listener(message.event);
        } catch {}
      });
      socket.once('error', (error: Error) => {
        if (!settled) reject(error);
      });
    });
  }
}

function toPlanSummary(plan: any): PlanSummary {
  return {
    id: String(plan.id),
    title: String(plan.title ?? plan.goal ?? plan.id),
    goal: String(plan.goal ?? ''),
    status: String(plan.status ?? 'unknown'),
    taskCount: Array.isArray(plan.tasks) ? plan.tasks.length : 0,
    updatedAt: plan.updatedAt,
  };
}

function toSessionSummary(session: any): SessionSummary {
  return {
    id: String(session.id),
    title: String(session.title ?? session.goal ?? session.id),
    objective: String(session.objective ?? session.goal ?? ''),
    status: String(session.status ?? 'unknown'),
    participantCount: Array.isArray(session.participants)
      ? session.participants.length
      : Array.isArray(session.assignedAgentIds)
        ? session.assignedAgentIds.length
        : 0,
    createdAt: session.createdAt,
  };
}

function normalizeRoutingAgent(agent: RoutingAgent): RoutingAgent | undefined {
  const aliases: Readonly<Record<string, string>> = { planning: 'planner', documenter: 'documentation' };
  const role = aliases[agent.role] ?? agent.role;
  if (!['planner', 'architect', 'developer', 'reviewer', 'verifier', 'documentation'].includes(role)) return undefined;
  return { ...agent, role };
}

export function splitArguments(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

export function snapshotFromEvents(events: readonly TuiEvent[]): TuiSnapshot {
  let workspace: TuiSnapshot['workspace'];
  const agents = new Map<string, AgentCard>();
  let graphEntities: TuiSnapshot['graphEntities'] = [];
  for (const event of events) {
    if (event.type === 'workspace') workspace = event.workspace;
    else if (event.type === 'agent') agents.set(event.agent.id, event.agent);
    else if (event.type === 'graph') graphEntities = event.entities;
  }
  return { workspace, agents: [...agents.values()], graphEntities };
}
