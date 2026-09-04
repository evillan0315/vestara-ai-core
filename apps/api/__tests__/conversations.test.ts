import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { DefaultContextAssembler } from '@vestara/context';
import { type ConversationService, DefaultConversationService } from '@vestara/conversation';
import { normalizeAssistantExecutionDetail } from '@vestara/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { handleConversationsRoute } from '../src/routes/conversations.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

function service(): ConversationService {
  return new DefaultConversationService({
    contextAssembler: new DefaultContextAssembler(),
    providerExecutor: {
      async complete() {
        return {
          id: 'resp-1',
          model: 'test-model',
          provider: 'test',
          content: 'Hello back',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latency: 1,
        };
      },
      async *stream() {
        yield {
          id: 'chunk-1',
          type: 'text',
          content: 'Streamed reply',
          metadata: { sequence: 0, timestamp: '2026-08-03T00:00:00.000Z' },
        };
        yield {
          id: 'chunk-2',
          type: 'complete',
          metadata: { sequence: 1, timestamp: '2026-08-03T00:00:00.000Z' },
        };
      },
    },
  });
}

function makeContext(conversationService: ConversationService): WorkspaceContext {
  return { conversationService } as unknown as WorkspaceContext;
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(method: string, url: string, body?: string): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = {};
  if (body) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

afterEach(() => {
  // Drain queued microtasks so readBody resolvers settle before the next test.
});

describe('conversations routes', () => {
  it('creates a conversation', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleConversationsRoute(
      'POST',
      '/api/conversations',
      fakeRequest('POST', '/api/conversations'),
      res,
      makeContext(service()),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(201);
    expect((body() as { conversation: { id: string } }).conversation.id).toBeTruthy();
  });

  it('lists and retrieves a conversation with history', async () => {
    const ctx = makeContext(service());
    const created = await ctx.conversationService.createConversation('local');

    const list = fakeResponse();
    await handleConversationsRoute(
      'GET',
      '/api/conversations',
      fakeRequest('GET', '/api/conversations'),
      list.res,
      ctx,
    );
    const listed = (list.body() as { conversations: Array<{ id: string }> }).conversations;
    expect(listed.some((c) => c.id === created.id)).toBe(true);

    const detail = fakeResponse();
    await handleConversationsRoute(
      'GET',
      `/api/conversations/${created.id}`,
      fakeRequest('GET', `/api/conversations/${created.id}`),
      detail.res,
      ctx,
    );
    const got = detail.body() as { conversation: { id: string; messages: unknown[] } };
    expect(got.conversation.id).toBe(created.id);
    expect(got.conversation.messages).toHaveLength(0);
  });

  it('sends a non-stream message and persists it', async () => {
    const ctx = makeContext(service());
    const created = await ctx.conversationService.createConversation('local');

    const { res, body, status } = fakeResponse();
    await handleConversationsRoute(
      'POST',
      `/api/conversations/${created.id}/messages`,
      fakeRequest('POST', `/api/conversations/${created.id}/messages`, JSON.stringify({ message: 'hi' })),
      res,
      ctx,
    );
    expect(status()).toBe(200);
    const sent = body() as { message: { role: string }; response: { content: string } };
    expect(sent.message.role).toBe('user');
    expect(sent.response.content).toBe('Hello back');

    const detail = fakeResponse();
    await handleConversationsRoute(
      'GET',
      `/api/conversations/${created.id}`,
      fakeRequest('GET', `/api/conversations/${created.id}`),
      detail.res,
      ctx,
    );
    const got = detail.body() as { conversation: { messages: Array<{ role: string; content: string }> } };
    expect(got.conversation.messages).toHaveLength(2);
    expect(got.conversation.messages[0]?.content).toBe('hi');
    expect(got.conversation.messages[1]?.content).toBe('Hello back');
  });

  it('deletes a conversation', async () => {
    const ctx = makeContext(service());
    const created = await ctx.conversationService.createConversation('local');

    const { res, status } = fakeResponse();
    await handleConversationsRoute(
      'DELETE',
      `/api/conversations/${created.id}`,
      fakeRequest('DELETE', `/api/conversations/${created.id}`),
      res,
      ctx,
    );
    expect(status()).toBe(200);
    expect(await ctx.conversationService.getConversation(created.id)).toBeNull();
  });

  it('returns 404 for a missing conversation', async () => {
    const { res, body, status } = fakeResponse();
    await handleConversationsRoute(
      'GET',
      '/api/conversations/nope',
      fakeRequest('GET', '/api/conversations/nope'),
      res,
      makeContext(service()),
    );
    expect(status()).toBe(404);
    expect((body() as { error: string }).error).toBe('Conversation not found');
  });

  it('SSE propagation: structured edit patch survives StreamChunk.detail → ConversationChunk.event.execution', async () => {
    // GA-UX-PREMIUM M3.2: prove the complete route chain carries runtime patch
    // evidence (and that structured hunks — M3.1 — still propagate too).
    const PATCH = '@@ -10,3 +10,3 @@\n ctx\n+ add\n- del\n';
    const patchDetail = normalizeAssistantExecutionDetail({
      contract: 'assistant.execution.v1',
      version: 1,
      operationId: 'edit:ses:file',
      kind: 'edit',
      state: 'completed',
      file: 'packages/foo/src/index.ts',
      operation: 'modified',
      additions: 5,
      deletions: 4,
      diffProvenance: 'runtime-provided',
      patch: PATCH,
    });
    const hunksDetail = normalizeAssistantExecutionDetail({
      contract: 'assistant.execution.v1',
      version: 1,
      operationId: 'edit:ses:file2',
      kind: 'edit',
      state: 'completed',
      file: 'packages/foo/src/hunks.ts',
      operation: 'modified',
      additions: 2,
      deletions: 1,
      diffProvenance: 'runtime-provided',
      hunks: [{ oldStart: 10, oldLines: 3, newStart: 10, newLines: 3, content: ' ctx' }],
    });
    expect(patchDetail).toBeDefined();
    expect(hunksDetail).toBeDefined();

    const editService = new DefaultConversationService({
      contextAssembler: new DefaultContextAssembler(),
      providerExecutor: {
        async complete() {
          return {
            id: 'resp-1',
            model: 'test-model',
            provider: 'test',
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latency: 1,
          };
        },
        async *stream() {
          yield {
            id: 'chunk-edit-patch',
            type: 'tool_result',
            name: 'edit',
            content: '',
            detail: patchDetail,
            metadata: { sequence: 0, timestamp: '2026-08-03T00:00:00.000Z' },
          };
          yield {
            id: 'chunk-edit-hunks',
            type: 'tool_result',
            name: 'edit',
            content: '',
            detail: hunksDetail,
            metadata: { sequence: 1, timestamp: '2026-08-03T00:00:00.000Z' },
          };
          yield {
            id: 'chunk-complete',
            type: 'complete',
            metadata: { sequence: 2, timestamp: '2026-08-03T00:00:00.000Z' },
          };
        },
      },
    });
    const ctx = makeContext(editService);
    const created = await ctx.conversationService.createConversation('local');

    // Capture res.write SSE frames.
    const frames: string[] = [];
    const res = new EventEmitter() as unknown as http.ServerResponse;
    res.writeHead = () => res as unknown as http.ServerResponse;
    res.write = (data: unknown) => {
      frames.push(String(data));
      return true;
    };
    res.end = () => res as unknown as http.ServerResponse;

    await handleConversationsRoute(
      'POST',
      `/api/conversations/${created.id}/stream`,
      fakeRequest('POST', `/api/conversations/${created.id}/stream`, JSON.stringify({ message: 'edit the file' })),
      res,
      ctx,
    );

    const dataFrames = frames.map((f) => f.replace(/^data: /, '').trim()).filter(Boolean);
    const parsed = dataFrames.map((f) => JSON.parse(f));
    const patchFrame = parsed.find(
      (f: { event: { type: string; execution?: { patch?: string } } }) =>
        f.event.type === 'tool_result' && f.event.execution?.patch,
    );
    const hunksFrame = parsed.find(
      (f: { event: { type: string; execution?: { hunks?: unknown[] } } }) =>
        f.event.type === 'tool_result' && f.event.execution?.hunks,
    );
    expect(patchFrame).toBeDefined();
    const patchExecution = patchFrame.event.execution;
    expect(patchExecution.contract).toBe('assistant.execution.v1');
    expect(patchExecution.kind).toBe('edit');
    expect(patchExecution.file).toBe('packages/foo/src/index.ts');
    expect(patchExecution.diffRepresentation).toBe('patch');
    expect(patchExecution.patch).toBe(PATCH);
    expect(patchExecution.patchTruncated).toBeUndefined();
    expect(patchExecution.hunks).toBeUndefined();
    expect(hunksFrame).toBeDefined();
    expect(hunksFrame.event.execution.diffRepresentation).toBe('hunks');
    expect(hunksFrame.event.execution.hunks).toEqual([
      { oldStart: 10, oldLines: 3, newStart: 10, newLines: 3, content: ' ctx' },
    ]);
    expect(hunksFrame.event.execution.patch).toBeUndefined();
  });
});
