import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  IdempotentActivityStore,
  M9IngestionBridge,
  migrateRuntimeInteractionSchema,
  ProjectionRuntime,
  projectActivitySnapshot,
  RuntimeQuestionInteractionStore,
} from '@vestara/activity-room';
import { InProcessEventBus } from '@vestara/event-bus';
import type { CompletionRequest } from '@vestara/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantInteractionBroker } from '../src/assistant-interaction-broker';
import {
  createRuntimeQuestionIngestHook,
  createRuntimeQuestionResponseHook,
  runAssistantOpenCodeTurn,
} from '../src/assistant-opencode-adapter';

const databases: DatabaseSync[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

function authority(): RuntimeQuestionInteractionStore {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  migrateRuntimeInteractionSchema(db);
  return new RuntimeQuestionInteractionStore(db);
}

function request(): CompletionRequest {
  return {
    model: 'test-model',
    provider: 'opencode',
    messages: [{ role: 'user', content: 'ask me a question' }],
    temperature: 0,
    maxTokens: 100,
    conversationId: 'conv-response-test',
  } as CompletionRequest;
}

async function runQuestionTurn(store: RuntimeQuestionInteractionStore, reply: () => Promise<boolean>) {
  const broker = new AssistantInteractionBroker();
  let releaseAfterReply!: () => void;
  const replyComplete = new Promise<void>((resolve) => {
    releaseAfterReply = resolve;
  });
  const client = {
    sendMessageAsync: async () => undefined,
    openEventStream: async function* () {
      yield {
        type: 'question.asked',
        payload: {
          sessionID: 'ses-response-test',
          id: 'req-response-test',
          questions: [{ header: 'Choose', question: 'Continue?', options: [{ label: 'Yes' }] }],
        },
      };
      await replyComplete;
      yield {
        type: 'session.status',
        payload: { sessionID: 'ses-response-test', status: { type: 'idle' } },
      };
    },
    replyToQuestion: async () => {
      try {
        return await reply();
      } finally {
        releaseAfterReply();
      }
    },
    rejectQuestion: async () => {
      releaseAfterReply();
      return true;
    },
  };
  const failures: Array<{ message: string; detail: Record<string, unknown> }> = [];
  const options = {
    client,
    workspaceId: 'workspace',
    directory: '/repo',
    agent: 'vestara-assistant',
    interactionBroker: broker,
    runtimeQuestionIngest: createRuntimeQuestionIngestHook({
      getStore: () => store,
      reportFailure: (message, detail) => failures.push({ message, detail }),
    }),
    runtimeQuestionResponse: createRuntimeQuestionResponseHook({
      getStore: () => store,
      reportFailure: (message, detail) => failures.push({ message, detail }),
    }),
  } as const;
  const iterator = runAssistantOpenCodeTurn(options, request(), 'ses-response-test');
  const first = await iterator.next();
  expect(first.done).toBe(false);
  const pending = iterator.next();
  let decided = false;
  for (let attempt = 0; attempt < 20 && !decided; attempt += 1) {
    decided = broker.decideQuestion('conv-response-test', 'req-response-test', { answers: [['Yes']] });
    if (!decided) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(decided).toBe(true);
  return { iterator, pending, first, store, failures };
}

describe('AR-HITL-002A live runtime-question response convergence', () => {
  it('documents legacy answer HTTP semantics as broker acceptance only', () => {
    const source = readFileSync(new URL('../src/routes/conversations.ts', import.meta.url), 'utf8');
    const start = source.indexOf('const earlyQuestionMatch = p.match');
    const end = source.indexOf('// Explicit Stop', start);
    const block = source.slice(start, end);
    expect(block).toContain('ctx.assistantInteractionBroker.decideQuestion');
    expect(block).toContain('json(res, 200, { ok: true, requestId });');
    expect(block).not.toContain('markDelivered');
    expect(block).not.toContain('.claim(');
  });

  it('claims before delivery and marks successful answer terminal', async () => {
    const store = authority();
    const run = await runQuestionTurn(store, async () => true);
    const chunks = [run.first.value];
    const second = await run.pending;
    if (second.value) chunks.push(second.value);
    for await (const chunk of run.iterator) chunks.push(chunk);
    expect(chunks.some((chunk) => chunk.type === 'status' && chunk.content === 'Answered')).toBe(true);
    expect(store.getByRuntimeIds('ses-response-test', 'req-response-test')?.status).toBe('answered');
    expect(store.listPending()).toHaveLength(0);
    expect(run.failures).toHaveLength(0);
  });

  it('marks delivery-unknown and never emits answered when delivery fails', async () => {
    const store = authority();
    const run = await runQuestionTurn(store, async () => {
      throw new Error('OpenCode unavailable');
    });
    await expect(run.pending).rejects.toThrow('delivery could not be confirmed');
    expect(store.getByRuntimeIds('ses-response-test', 'req-response-test')?.status).toBe('delivery-unknown');
    expect(store.listPending()).toHaveLength(0);
  });

  it('duplicate response cannot claim the same exact interaction twice', () => {
    const store = authority();
    const failures: Array<{ message: string; detail: Record<string, unknown> }> = [];
    createRuntimeQuestionIngestHook({
      getStore: () => store,
      reportFailure: (message, detail) => failures.push({ message, detail }),
    })({
      conversationId: 'conv-response-test',
      openCodeSessionId: 'ses-duplicate',
      openCodeRequestId: 'req-duplicate',
      questions: [{ question: 'Continue?', options: [{ label: 'Yes' }] }],
    });
    const prepare = createRuntimeQuestionResponseHook({
      getStore: () => store,
      reportFailure: (message, detail) => failures.push({ message, detail }),
    });
    const first = prepare({
      conversationId: 'conv-response-test',
      openCodeSessionId: 'ses-duplicate',
      openCodeRequestId: 'req-duplicate',
      decision: 'answered',
      answers: [['Yes']],
    });
    expect(() =>
      prepare({
        conversationId: 'conv-response-test',
        openCodeSessionId: 'ses-duplicate',
        openCodeRequestId: 'req-duplicate',
        decision: 'answered',
        answers: [['Yes']],
      }),
    ).toThrow(/interaction is claimed/);
    first.markDelivered('answered');
    expect(store.listPending()).toHaveLength(0);
  });

  it('closes the exact failed question operation through M9, M10, and snapshot projection', async () => {
    const store = authority();
    const bus = new InProcessEventBus();
    const m9 = new IdempotentActivityStore();
    const bridge = new M9IngestionBridge({ store: m9, eventBus: bus });
    bridge.start();
    await bus.emit({
      type: 'conversation:message.sent',
      source: 'conversation-service',
      actor: { id: 'workspace-ui', role: 'user' },
      payload: { conversationId: 'conv-response-test', messageId: 'msg-question', content: 'ask' },
    });

    const broker = new AssistantInteractionBroker();
    let releaseQuestion!: () => void;
    const questionReleased = new Promise<void>((resolve) => {
      releaseQuestion = resolve;
    });
    const client = {
      sendMessageAsync: async () => undefined,
      openEventStream: async function* () {
        yield {
          type: 'message.part.updated',
          payload: {
            sessionID: 'ses-response-test',
            part: { type: 'tool', callID: 'call-question-1', tool: 'question', state: { status: 'running' } },
          },
        };
        yield {
          type: 'question.asked',
          payload: {
            sessionID: 'ses-response-test',
            id: 'req-response-test',
            questions: [{ header: 'Choose', question: 'Continue?', options: [{ label: 'Yes' }] }],
          },
        };
        await questionReleased;
      },
      replyToQuestion: async () => {
        releaseQuestion();
        throw new Error('OpenCode unavailable');
      },
      rejectQuestion: async () => true,
    };
    const iterator = runAssistantOpenCodeTurn(
      {
        client,
        workspaceId: 'workspace',
        directory: '/repo',
        agent: 'vestara-assistant',
        interactionBroker: broker,
        eventBus: bus,
        runtimeQuestionIngest: createRuntimeQuestionIngestHook({ getStore: () => store, reportFailure: () => {} }),
        runtimeQuestionResponse: createRuntimeQuestionResponseHook({ getStore: () => store, reportFailure: () => {} }),
      },
      request(),
      'ses-response-test',
    );

    expect((await iterator.next()).value?.type).toBe('tool_call');
    expect((await iterator.next()).value?.type).toBe('status');
    const response = iterator.next();
    let decided = false;
    for (let attempt = 0; attempt < 20 && !decided; attempt += 1) {
      decided = broker.decideQuestion('conv-response-test', 'req-response-test', { answers: [['Yes']] });
      if (!decided) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(decided).toBe(true);
    await expect(response).rejects.toThrow('delivery could not be confirmed');

    const records = await m9.query({ limit: 100 });
    const toolRecords = records.filter((record) => record.payload.data?.callID === 'call-question-1');
    expect(toolRecords.map((record) => record.type)).toEqual(['tool.called', 'tool.failed']);
    expect(toolRecords[1]).toMatchObject({
      runtimeSessionBindingId: 'ses-response-test',
      payload: { data: { callID: 'call-question-1', conversationId: 'conv-response-test' } },
    });

    const runtime = new ProjectionRuntime();
    runtime.rebuild(records);
    const snapshot = await projectActivitySnapshot(
      {
        fetchPage: (beforeSequence, limit) => m9.query({ beforeSequence, limit }),
        projectRecord: (record) => runtime.projectRecord(record),
      },
      { startBefore: Number.MAX_SAFE_INTEGER },
    );
    const operation = snapshot.entities
      .flatMap((entity) => entity.operations)
      .find((candidate) => candidate.operationId === 'call-question-1');
    expect(operation).toMatchObject({
      status: 'failed',
      conversationId: 'conv-response-test',
      runtimeSessionBindingId: 'ses-response-test',
    });

    // Re-delivery of the exact terminal fact remains idempotent in M9.
    const terminal = {
      type: 'opencode.message.part.updated',
      source: 'assistant-opencode-adapter',
      actor: { id: 'vestara-assistant', role: 'agent' as const },
      payload: {
        part: { type: 'tool', callID: 'call-question-1', tool: 'question', state: { status: 'error' } },
        conversationId: 'conv-response-test',
        sessionId: 'ses-response-test',
      },
      metadata: { correlationId: 'conv-response-test' },
    } as const;
    await bus.emit(terminal);
    await bus.emit(terminal);
    expect((await m9.query({ limit: 100 })).filter((record) => record.type === 'tool.failed')).toHaveLength(1);
    bridge.stop();
  });
});
