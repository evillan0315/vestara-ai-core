import { DefaultContextAssembler } from '@vestara/context';
import type { CompletionRequest, StreamChunk } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { DefaultConversationService, type ProviderExecutor } from '../src';

function chunk(type: StreamChunk['type'], metadata: StreamChunk['metadata'], content = ''): StreamChunk {
  return {
    id: `${type}-${metadata.sequence}`,
    type,
    content,
    metadata,
  };
}

function serviceWith(executor: ProviderExecutor) {
  return new DefaultConversationService({
    contextAssembler: new DefaultContextAssembler(),
    providerExecutor: executor,
  });
}

describe('conversation runtime attribution', () => {
  it('attributes a Codex stream turn to Codex without fabricating a model', async () => {
    const executor: ProviderExecutor = {
      async complete() {
        throw new Error('unused');
      },
      async *stream(_request: CompletionRequest) {
        yield chunk(
          'text',
          {
            sequence: 0,
            timestamp: new Date().toISOString(),
            provider: 'openai-codex',
            execution: { runtimeId: 'codex', providerId: 'openai-codex' },
          },
          'done',
        );
        yield chunk('complete', {
          sequence: 1,
          timestamp: new Date().toISOString(),
          provider: 'openai-codex',
          execution: { runtimeId: 'codex', providerId: 'openai-codex' },
          executionResult: {
            termination: 'completed',
            toolCallCount: 0,
            elapsedMs: 10,
            execution: { runtimeId: 'codex', providerId: 'openai-codex' },
          },
        });
      },
    };
    const service = serviceWith(executor);
    const conversation = await service.createConversation();

    for await (const _ of service.sendMessageStream(conversation.id, 'hello', {
      assistantRuntime: 'codex',
      model: 'deepseek-v4-flash-free',
    })) {
      // drain
    }

    const reloaded = await service.getConversation(conversation.id);
    const assistant = reloaded?.messages.find((message) => message.role === 'assistant');
    expect(assistant?.provider).toBe('openai-codex');
    expect(assistant?.model).toBeUndefined();
    expect(assistant?.executionResult?.execution).toEqual({ runtimeId: 'codex', providerId: 'openai-codex' });
  });

  it('switching runtimes does not rewrite historical attribution', async () => {
    let runtime: 'codex' | 'opencode' = 'codex';
    const executor: ProviderExecutor = {
      async complete() {
        throw new Error('unused');
      },
      async *stream() {
        if (runtime === 'codex') {
          yield chunk('text', {
            sequence: 0,
            timestamp: new Date().toISOString(),
            provider: 'openai-codex',
            execution: { runtimeId: 'codex', providerId: 'openai-codex' },
          });
          yield chunk('complete', {
            sequence: 1,
            timestamp: new Date().toISOString(),
            provider: 'openai-codex',
            executionResult: {
              termination: 'completed',
              toolCallCount: 0,
              elapsedMs: 1,
              execution: { runtimeId: 'codex', providerId: 'openai-codex' },
            },
          });
          return;
        }
        yield chunk('text', {
          sequence: 0,
          timestamp: new Date().toISOString(),
          provider: 'provider-a',
          model: 'model-a',
          execution: { runtimeId: 'opencode', providerId: 'provider-a', modelId: 'model-a' },
        });
        yield chunk('complete', {
          sequence: 1,
          timestamp: new Date().toISOString(),
          provider: 'provider-a',
          model: 'model-a',
          executionResult: {
            termination: 'completed',
            toolCallCount: 0,
            elapsedMs: 1,
            execution: { runtimeId: 'opencode', providerId: 'provider-a', modelId: 'model-a' },
          },
        });
      },
    };
    const service = serviceWith(executor);
    const conversation = await service.createConversation();

    for await (const _ of service.sendMessageStream(conversation.id, 'codex turn', {
      assistantRuntime: 'codex',
      model: 'deepseek-v4-flash-free',
    })) {
      // drain
    }
    runtime = 'opencode';
    for await (const _ of service.sendMessageStream(conversation.id, 'opencode turn', {
      assistantRuntime: 'opencode',
      provider: 'provider-a',
      model: 'model-a',
    })) {
      // drain
    }

    const messages = (await service.getConversation(conversation.id))?.messages.filter(
      (message) => message.role === 'assistant',
    );
    expect(messages?.[0]?.executionResult?.execution).toEqual({ runtimeId: 'codex', providerId: 'openai-codex' });
    expect(messages?.[0]?.model).toBeUndefined();
    expect(messages?.[1]?.executionResult?.execution).toEqual({
      runtimeId: 'opencode',
      providerId: 'provider-a',
      modelId: 'model-a',
    });
    expect(messages?.[1]?.model).toBe('model-a');
  });
});
