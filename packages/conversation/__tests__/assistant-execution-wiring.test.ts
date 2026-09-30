import type { ContextAssembler } from '@vestara/context';
import type {
  AssistantExecutionObservationReference,
  AssistantExecutionRecord,
  AssistantRuntimeCorrelation,
  ExecutionId,
  ExecutionResult,
  ExecutionStatus,
} from '@vestara/execution-types';
import type { Conversation, ConversationSummary, Message, StreamChunk } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import {
  type AssistantExecutionStore,
  type ConversationListPage,
  type ConversationService,
  type ConversationStore,
  DefaultConversationService,
  type ProviderExecutor,
} from '../src';

class RecordingExecutionStore implements AssistantExecutionStore {
  readonly events: string[] = [];
  readonly records = new Map<string, AssistantExecutionRecord>();
  failCreate = false;

  async createExecution(record: AssistantExecutionRecord): Promise<void> {
    this.events.push('create');
    if (this.failCreate) throw new Error('execution persistence unavailable');
    this.records.set(record.executionId, record);
  }

  async getExecution(executionId: ExecutionId): Promise<AssistantExecutionRecord | null> {
    return this.records.get(executionId as string) ?? null;
  }

  async listActiveExecutions(conversationId: string): Promise<readonly AssistantExecutionRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.conversationId === conversationId &&
        !['completed', 'failed', 'cancelled', 'timed_out'].includes(record.status),
    );
  }

  async updateExecutionStatus(executionId: ExecutionId, status: ExecutionStatus, updatedAt: string): Promise<void> {
    this.events.push(`status:${status}`);
    const current = this.records.get(executionId as string);
    if (!current) throw new Error('missing execution');
    this.records.set(executionId as string, { ...current, status, updatedAt });
  }

  async updateExecutionRuntime(
    executionId: ExecutionId,
    runtime: AssistantRuntimeCorrelation,
    updatedAt: string,
  ): Promise<void> {
    this.events.push('runtime');
    const current = this.records.get(executionId as string);
    if (!current) throw new Error('missing execution');
    this.records.set(executionId as string, { ...current, runtime, updatedAt });
  }

  async updateExecutionObservation(
    executionId: ExecutionId,
    observation: AssistantExecutionObservationReference,
    updatedAt: string,
  ): Promise<void> {
    const current = this.records.get(executionId as string);
    if (!current) throw new Error('missing execution');
    this.records.set(executionId as string, { ...current, observation, updatedAt });
  }

  async attachExecutionResult(executionId: ExecutionId, result: ExecutionResult, updatedAt: string): Promise<void> {
    this.events.push('result');
    const current = this.records.get(executionId as string);
    if (!current) throw new Error('missing execution');
    if (result.id !== executionId) throw new Error('result identity mismatch');
    this.records.set(executionId as string, { ...current, result, updatedAt });
  }
}

class TestConversationStore implements ConversationStore {
  readonly executionStore = new RecordingExecutionStore();
  readonly conversations = new Map<string, Conversation>();

  async create(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async get(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.get(id);
  }

  async list(_userId: string): Promise<ConversationSummary[]> {
    return [];
  }

  async listPage(_userId: string): Promise<ConversationListPage> {
    return { conversations: [], total: 0, offset: 0, limit: 25, hasMore: false };
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('missing conversation');
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
  }

  async setStatus(): Promise<void> {}
  async updateTitle(): Promise<void> {}
  async updateRuntimeSessionId(): Promise<void> {}
  async remove(id: string): Promise<void> {
    this.conversations.delete(id);
  }
}

const contextAssembler: ContextAssembler = {
  buildContext(conversation, content, options = {}) {
    return {
      model: 'test-model',
      messages: [{ role: 'user', content }],
      conversationId: conversation.id,
      ...(options.executionId ? { executionId: options.executionId } : {}),
      ...(options.assistantMessageId ? { assistantMessageId: options.assistantMessageId } : {}),
      ...(options.assistantRuntime ? { assistantRuntime: options.assistantRuntime } : {}),
    };
  },
};

function createService(store: TestConversationStore, providerExecutor: ProviderExecutor): ConversationService {
  return new DefaultConversationService({ contextAssembler, providerExecutor, store });
}

function chunk(type: StreamChunk['type'], metadata: StreamChunk['metadata'], content?: string): StreamChunk {
  return { id: `${type}-1`, type, content, metadata };
}

describe('assistant execution persistence wiring', () => {
  it('allocates and persists identities before runtime invocation, then settles the same identities', async () => {
    const store = new TestConversationStore();
    const invocationChecks: Array<{ executionId?: ExecutionId; assistantMessageId?: string; events: string[] }> = [];
    const providerExecutor: ProviderExecutor = {
      async complete() {
        throw new Error('unused');
      },
      async *stream(request) {
        const record = [...store.executionStore.records.values()][0];
        invocationChecks.push({
          executionId: request.executionId,
          assistantMessageId: request.assistantMessageId,
          events: [...store.executionStore.events],
        });
        expect(record?.status).toBe('running');
        yield chunk(
          'text',
          {
            sequence: 0,
            timestamp: new Date().toISOString(),
            runtimeSessionId: 'ses_1',
            provider: 'test',
            model: 'test-model',
          },
          'done',
        );
        yield chunk('complete', { sequence: 1, timestamp: new Date().toISOString(), runtimeSessionId: 'ses_1' });
      },
    };
    const service = createService(store, providerExecutor);
    const conversation = await service.createConversation('local');
    const chunks: StreamChunk[] = [];
    for await (const item of service.sendMessageStream(conversation.id, 'hello', { assistantRuntime: 'opencode' })) {
      chunks.push(item);
    }

    const execution = [...store.executionStore.records.values()][0];
    const persistedConversation = await store.get(conversation.id);
    const assistant = persistedConversation?.messages.find((message) => message.role === 'assistant');
    expect(invocationChecks[0]?.events).toEqual(['create', 'status:binding', 'status:ready', 'status:running']);
    expect(invocationChecks[0]?.executionId).toBe(execution?.executionId);
    expect(invocationChecks[0]?.assistantMessageId).toBe(execution?.assistantMessageId);
    expect(assistant?.id).toBe(execution?.assistantMessageId);
    expect(execution?.status).toBe('completed');
    expect(execution?.result?.id).toBe(execution?.executionId);
    expect(execution?.runtime).toMatchObject({ runtimeId: 'opencode', sessionId: 'ses_1' });
    expect(chunks.some((item) => item.type === 'complete')).toBe(true);
  });

  it('does not invoke the runtime when execution creation fails', async () => {
    const store = new TestConversationStore();
    store.executionStore.failCreate = true;
    let invoked = false;
    const providerExecutor: ProviderExecutor = {
      async complete() {
        invoked = true;
        throw new Error('must not run');
      },
      async *stream() {
        invoked = true;
        yield chunk('complete', { sequence: 0, timestamp: new Date().toISOString() });
      },
    };
    const service = createService(store, providerExecutor);
    const conversation = await service.createConversation('local');

    const consume = async () => {
      for await (const _item of service.sendMessageStream(conversation.id, 'hello')) {
        // consume until persistence failure
      }
    };
    await expect(consume()).rejects.toThrow('execution persistence unavailable');
    expect(invoked).toBe(false);
  });
});
