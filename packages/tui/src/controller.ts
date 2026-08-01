import WebSocket from 'ws';
import type { RawData } from 'ws';
import { normalizeRuntimeEvent } from './normalize.js';
import type { AgentCard, TuiEvent, TuiSnapshot } from './types.js';

export interface TuiControllerOptions {
  endpoint?: string;
}

export class TuiController {
  private readonly endpoint: URL;
  constructor(options: TuiControllerOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001');
  }

  async connect(listener: (event: TuiEvent) => void): Promise<() => void> {
    listener({ type: 'connection', state: 'connecting' });
    try {
      const [status, workspace, telemetry, graph] = await Promise.all([
        this.getJson<{ status: string; workspaceId: string; runtimeVersion: string; apiEndpoint: string }>(
          '/api/runtime/status',
        ),
        this.getJson<any>('/api/workspace'),
        this.getJson<{ agents?: AgentCard[] }>('/api/telemetry/agents').catch(() => ({ agents: [] })),
        this.getJson<{ entities?: Array<{ id: string; kind: string; label: string; status?: string }> }>(
          '/api/graph/entities?limit=100',
        ).catch(() => ({ entities: [] })),
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
      listener({ type: 'connection', state: 'connected' });
      const unsubscribe = await this.subscribe((raw) => {
        for (const event of normalizeRuntimeEvent(raw)) listener(event);
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
    yield* this.streamConversation(input, signal);
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
    throw new Error(`Unknown routing command: ${action}`);
  }

  private async *streamConversation(message: string, signal?: AbortSignal): AsyncGenerator<TuiEvent> {
    const id = `assistant-${Date.now()}`;
    yield { type: 'conversation-start', id };
    const response = await fetch(new URL('/api/chat/stream', this.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vestara-Source': 'cli' },
      body: JSON.stringify({ message }),
      signal,
    });
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
        const event = JSON.parse(line.slice(6)) as { type: string; content?: string };
        if (event.type === 'text' && event.content) yield { type: 'conversation-delta', id, content: event.content };
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
