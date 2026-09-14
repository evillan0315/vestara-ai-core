/**
 * GA-TOOL-UX-001B — durable tool observation persistence.
 *
 * Verifies: structured observations (including read evidence) survive the
 * SQLite round-trip; messages without observations load with absent
 * observations; legacy rows degrade safely.
 */

import type { Conversation, Message, ToolObservation } from '@vestara/shared';
import { describe, expect, it } from 'vitest';

function conv(id: string): Conversation {
  return {
    id,
    userId: 'local',
    title: `Conversation ${id}`,
    messages: [],
    status: 'active',
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}

function readObservation(): ToolObservation {
  return {
    toolCallId: 'call_r1',
    operationId: 'call_r1',
    observationKind: 'read',
    toolName: 'read',
    status: 'completed',
    timestamp: '2026-08-03T00:00:02.000Z',
    content: '1: a\n2: b',
    read: {
      contract: 'assistant.execution.v1',
      version: 1,
      operationId: 'call_r1',
      state: 'completed',
      tool: 'read',
      source: 'opencode',
      timestamp: 1_700_000_000_000,
      kind: 'read',
      file: 'docs/notes.md',
      fileProvenance: 'runtime-provided',
      offset: 1,
      lineCount: 2,
      totalLines: 9,
      contentPreview: '1: a\n2: b',
      contentTruncated: false,
      contentProvenance: 'runtime-provided',
      rangeProvenance: 'runtime-provided',
    },
  };
}

describe('@vestara/conversation-runtime tool observation persistence', () => {
  it('structured read observation survives the SQLite round-trip', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-obs-1');
    await store.create(conversation);
    const message: Message = {
      id: 'msg-obs-1',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'done',
      createdAt: '2026-08-03T00:00:01.000Z',
      toolObservations: [readObservation()],
    };
    await store.addMessage(conversation.id, message);

    const loaded = await store.get(conversation.id);
    const persisted = loaded?.messages.find((m) => m.id === 'msg-obs-1');
    expect(persisted?.toolObservations).toHaveLength(1);
    const obs = persisted!.toolObservations![0];
    expect(obs.operationId).toBe('call_r1');
    expect(obs.observationKind).toBe('read');
    expect(obs.status).toBe('completed');
    expect(obs.read?.file).toBe('docs/notes.md');
    expect(obs.read?.contentPreview).toBe('1: a\n2: b');
    expect(obs.read?.totalLines).toBe(9);

    // Windowed read (the GET path) also recovers observations.
    const windowed = await store.getConversation(conversation.id, { limit: 50, offset: 0, order: 'desc' });
    expect(windowed?.messages.find((m) => m.id === 'msg-obs-1')?.toolObservations).toHaveLength(1);

    await store.remove(conversation.id);
  });

  it('messages without observations load with absent observations', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-obs-2');
    await store.create(conversation);
    await store.addMessage(conversation.id, {
      id: 'msg-plain',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'plain',
      createdAt: '2026-08-03T00:00:01.000Z',
    });
    const loaded = await store.get(conversation.id);
    expect(loaded?.messages[0]?.toolObservations).toBeUndefined();
    await store.remove(conversation.id);
  });

  it('running and generic observations round-trip alongside read evidence', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-obs-3');
    await store.create(conversation);
    await store.addMessage(conversation.id, {
      id: 'msg-mixed',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'mixed',
      createdAt: '2026-08-03T00:00:01.000Z',
      toolObservations: [
        readObservation(),
        {
          toolCallId: 'call_b1',
          operationId: 'call_b1',
          toolName: 'bash',
          status: 'running',
          timestamp: '2026-08-03T00:00:02.000Z',
          content: '',
        },
      ],
    });
    const loaded = await store.get(conversation.id);
    const observations = loaded?.messages[0]?.toolObservations ?? [];
    expect(observations).toHaveLength(2);
    expect(observations[1].status).toBe('running');
    await store.remove(conversation.id);
  });
});
