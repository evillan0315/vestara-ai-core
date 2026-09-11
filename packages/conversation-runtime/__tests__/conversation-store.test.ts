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

  // ── VES-PERF-001B: bounded newest-window-first reads ──

  async function seedMessages(
    store: { addMessage: (id: string, m: Message) => Promise<void> },
    id: string,
    count: number,
  ) {
    const base = Date.UTC(2026, 7, 3, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      await store.addMessage(id, {
        id: `m-${String(i).padStart(3, '0')}`,
        conversationId: id,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
        // Distinct, monotonic timestamps so ordering is deterministic.
        createdAt: new Date(base + i * 1000).toISOString(),
      });
    }
  }

  it('get() remains unbounded for backward compatibility', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-window-unbounded');
    await store.create(conversation);
    await seedMessages(store, conversation.id, 120);

    const loaded = await store.get(conversation.id);
    expect(loaded?.messages).toHaveLength(120);
    expect(loaded?.messages[0]?.content).toBe('message 0');
    expect(loaded?.messages[119]?.content).toBe('message 119');
    expect(loaded?._pagination).toBeUndefined();
  });

  it('getConversation() returns the newest window in chronological order', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-window-newest');
    await store.create(conversation);
    await seedMessages(store, conversation.id, 120);

    const window = await store.getConversation(conversation.id, { limit: 50 });
    expect(window?.messages).toHaveLength(50);
    // Newest 50 (messages 70..119), returned oldest→newest.
    expect(window?.messages[0]?.content).toBe('message 70');
    expect(window?.messages[49]?.content).toBe('message 119');
    expect(window?._pagination).toEqual({ total: 120, offset: 0, limit: 50, hasMore: true });
  });

  it('getConversation() paginates backward into older messages', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-window-older');
    await store.create(conversation);
    await seedMessages(store, conversation.id, 120);

    const page2 = await store.getConversation(conversation.id, { limit: 50, offset: 50 });
    expect(page2?.messages).toHaveLength(50);
    // Next-older 50 (messages 20..69), returned oldest→newest.
    expect(page2?.messages[0]?.content).toBe('message 20');
    expect(page2?.messages[49]?.content).toBe('message 69');
    expect(page2?._pagination).toEqual({ total: 120, offset: 50, limit: 50, hasMore: true });

    const page3 = await store.getConversation(conversation.id, { limit: 50, offset: 100 });
    expect(page3?.messages).toHaveLength(20);
    expect(page3?.messages[0]?.content).toBe('message 0');
    expect(page3?.messages[19]?.content).toBe('message 19');
    expect(page3?._pagination).toEqual({ total: 120, offset: 100, limit: 50, hasMore: false });
  });

  it('getConversation() with order=asc returns the oldest window', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    const conversation = conv('conv-window-asc');
    await store.create(conversation);
    await seedMessages(store, conversation.id, 30);

    const window = await store.getConversation(conversation.id, { limit: 10, order: 'asc' });
    expect(window?.messages).toHaveLength(10);
    expect(window?.messages[0]?.content).toBe('message 0');
    expect(window?.messages[9]?.content).toBe('message 9');
    expect(window?._pagination?.hasMore).toBe(true);
  });

  // ── VES-PERF-001C: bounded summary pagination ──

  it('listPage() returns bounded, metadata-only summary pages', async () => {
    const { SqliteConversationStore } = require('../dist/index.js') as typeof import('../src/conversation-store');
    const store = new SqliteConversationStore();
    for (let i = 0; i < 60; i++) {
      const c = conv(`conv-page-${String(i).padStart(2, '0')}`);
      await store.create(c);
      await store.addMessage(c.id, msg(`m-${i}`, c.id, 'user', 'hello'));
    }

    const page1 = await store.listPage('local', { limit: 25, offset: 0 });
    expect(page1.conversations).toHaveLength(25);
    expect(page1.total).toBe(60);
    expect(page1.hasMore).toBe(true);
    // Summaries never carry message bodies.
    expect((page1.conversations[0] as Record<string, unknown>).messages).toBeUndefined();
    expect(page1.conversations[0]?.messageCount).toBe(1);

    const page3 = await store.listPage('local', { limit: 25, offset: 50 });
    expect(page3.conversations).toHaveLength(10);
    expect(page3.hasMore).toBe(false);

    // Pages do not overlap.
    const ids1 = new Set(page1.conversations.map((c) => c.id));
    expect(page3.conversations.some((c) => ids1.has(c.id))).toBe(false);
  });
});
