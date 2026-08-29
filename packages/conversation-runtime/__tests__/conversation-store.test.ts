import type { Conversation, Message } from '@vestara/shared';
import { describe, expect, it } from 'vitest';

function conv(id: string, userId = 'local'): Conversation {
  return {
    id,
    userId,
    title: `Conversation ${id}`,
    messages: [],
    status: 'active',
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}

function msg(id: string, conversationId: string, role: Message['role'], content: string): Message {
  return {
    id,
    conversationId,
    role,
    content,
    createdAt: '2026-08-03T00:00:01.000Z',
  };
}

describe('@vestara/conversation-runtime SqliteConversationStore', () => {
  it('exports SqliteConversationStore', () => {
    const mod = require('../dist/index.js');
    expect(mod.SqliteConversationStore).toBeDefined();
    expect(typeof mod.SqliteConversationStore).toBe('function');
  });

  it('persists and reloads a conversation with messages', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();

    const conversation = conv('conv-persist-1');
    await store.create(conversation);
    await store.addMessage(conversation.id, msg('msg-1', conversation.id, 'user', 'hello'));
    await store.addMessage(conversation.id, msg('msg-2', conversation.id, 'assistant', 'hi there'));

    const loaded = await store.get(conversation.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0]?.role).toBe('user');
    expect(loaded?.messages[1]?.content).toBe('hi there');

    const list = await store.list('local');
    expect(list.some((c) => c.id === conversation.id)).toBe(true);

    await store.setStatus(conversation.id, 'archived');
    const archived = await store.get(conversation.id);
    expect(archived?.status).toBe('archived');

    await store.remove(conversation.id);
    expect(await store.get(conversation.id)).toBeNull();
  });

  it('scopes list by user and excludes deleted', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();

    const a = conv('conv-user-a', 'alice');
    const b = conv('conv-user-b', 'bob');
    await store.create(a);
    await store.create(b);

    const alice = await store.list('alice');
    expect(alice.some((c) => c.id === a.id)).toBe(true);
    expect(alice.some((c) => c.id === b.id)).toBe(false);

    await store.setStatus(a.id, 'deleted');
    const aliceAfter = await store.list('alice');
    expect(aliceAfter.some((c) => c.id === a.id)).toBe(false);
  });
});
