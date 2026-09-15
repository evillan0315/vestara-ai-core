import { migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { TelegramConversationBindingService } from '../src/conversation-binding';
import { TELEGRAM_MANIFEST } from '../src/migrations';
import { TelegramPersistentStore } from '../src/persistent-store';

async function makeStore(): Promise<TelegramPersistentStore> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, TELEGRAM_MANIFEST);
  return new TelegramPersistentStore(db);
}

function makeBinding(service: TelegramConversationBindingService, overrides: Record<string, string> = {}) {
  return service.createBinding({
    principalId: 'p-1',
    workspaceId: 'ws-1',
    telegramChatId: 'chat-1',
    telegramChatType: 'direct',
    vestaraConversationId: `conv-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
}

describe('TelegramConversationBindingService', () => {
  describe('createBinding', () => {
    it('creates a conversation binding', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      expect(binding.id).toMatch(/^conv-/);
      expect(binding.principalId).toBe('p-1');
      expect(binding.workspaceId).toBe('ws-1');
      expect(binding.telegramChatId).toBe('chat-1');
      expect(binding.vestaraConversationId).toBe('conv-1');
      expect(binding.status).toBe('active');
    });

    it('sets default model and provider', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      expect(binding.defaultModel).toBe('muse-spark-1.3-contributor');
      expect(binding.defaultProvider).toBe('opencode-go');
    });
  });

  describe('getActiveBinding', () => {
    it('finds active binding for chat and principal', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const found = service.getActiveBinding('chat-1', 'p-1');
      expect(found?.id).toBe(binding.id);
    });

    it('returns undefined for closed binding', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });
      service.closeBinding(binding.id);

      expect(service.getActiveBinding('chat-1', 'p-1')).toBeUndefined();
    });
  });

  describe('pauseBinding / resumeBinding', () => {
    it('pauses and resumes a binding', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      service.pauseBinding(binding.id);
      expect(service.getActiveBinding('chat-1', 'p-1')).toBeUndefined();

      service.resumeBinding(binding.id);
      expect(service.getActiveBinding('chat-1', 'p-1')).toBeDefined();
    });
  });

  describe('closeBinding', () => {
    it('closes a binding', () => {
      const service = new TelegramConversationBindingService();
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      service.closeBinding(binding.id);
      const closed = service.getBinding(binding.id);
      expect(closed?.status).toBe('closed');
    });
  });

  describe('canCreateConversation', () => {
    it('allows creation when under limit', () => {
      const service = new TelegramConversationBindingService({ maxConversationsPerChat: 3 });
      expect(service.canCreateConversation('chat-1')).toBe(true);
    });

    it('blocks creation when at limit', () => {
      const service = new TelegramConversationBindingService({ maxConversationsPerChat: 1 });
      service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      expect(service.canCreateConversation('chat-1')).toBe(false);
    });

    it('allows creation after closing a binding', () => {
      const service = new TelegramConversationBindingService({ maxConversationsPerChat: 1 });
      const binding = service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });
      service.closeBinding(binding.id);

      expect(service.canCreateConversation('chat-1')).toBe(true);
    });
  });

  describe('resolveConversationId', () => {
    it('resolves chat to conversation ID', () => {
      const service = new TelegramConversationBindingService();
      service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      expect(service.resolveConversationId('chat-1', 'p-1')).toBe('conv-1');
    });

    it('returns undefined for unknown chat', () => {
      const service = new TelegramConversationBindingService();
      expect(service.resolveConversationId('chat-999', 'p-1')).toBeUndefined();
    });
  });

  describe('getChatDefaults', () => {
    it('returns configured defaults when no active binding', () => {
      const service = new TelegramConversationBindingService();
      const defaults = service.getChatDefaults('chat-1');

      expect(defaults.model).toBe('muse-spark-1.3-contributor');
      expect(defaults.provider).toBe('opencode-go');
    });

    it('returns binding-specific defaults', () => {
      const service = new TelegramConversationBindingService();
      service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const defaults = service.getChatDefaults('chat-1');
      expect(defaults.model).toBe('muse-spark-1.3-contributor');
    });
  });

  describe('conversation identity protection', () => {
    it('rejects double-binding the same Vestara conversation to a second chat', () => {
      const service = new TelegramConversationBindingService();
      service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-shared',
      });

      expect(() =>
        service.createBinding({
          principalId: 'p-1',
          workspaceId: 'ws-1',
          telegramChatId: 'chat-2',
          telegramChatType: 'direct',
          vestaraConversationId: 'conv-shared',
        }),
      ).toThrow('Vestara conversation is already bound to a Telegram chat');
    });

    it('resolves the most recently active binding deterministically', async () => {
      const service = new TelegramConversationBindingService();
      const first = makeBinding(service, { vestaraConversationId: 'conv-first' });
      await new Promise((r) => setTimeout(r, 10));
      service.touchBinding(first.id);
      const second = makeBinding(service, { vestaraConversationId: 'conv-second' });

      expect(service.resolveConversationId('chat-1', 'p-1')).toBe(second.vestaraConversationId);
    });
  });

  describe('principal isolation', () => {
    it("does not resolve another principal's chat binding", () => {
      const service = new TelegramConversationBindingService();
      makeBinding(service, { principalId: 'p-1', vestaraConversationId: 'conv-p1' });

      expect(service.resolveConversationId('chat-1', 'p-2')).toBeUndefined();
      expect(service.getActiveBinding('chat-1', 'p-2')).toBeUndefined();
    });

    it('keeps per-principal listings separate', () => {
      const service = new TelegramConversationBindingService();
      makeBinding(service, { principalId: 'p-1', vestaraConversationId: 'conv-p1' });
      makeBinding(service, { principalId: 'p-2', vestaraConversationId: 'conv-p2' });

      expect(service.getBindingsByPrincipal('p-1')).toHaveLength(1);
      expect(service.getBindingsByPrincipal('p-2')).toHaveLength(1);
    });
  });

  describe('workspace isolation', () => {
    it('does not resolve a chat bound under another workspace when scoped', () => {
      const service = new TelegramConversationBindingService();
      makeBinding(service, { workspaceId: 'ws-A', vestaraConversationId: 'conv-a' });

      expect(service.resolveConversationId('chat-1', 'p-1', 'ws-B')).toBeUndefined();
      expect(service.resolveConversationId('chat-1', 'p-1', 'ws-A')).toBe('conv-a');
    });

    it('keeps unscoped resolution backward compatible', () => {
      const service = new TelegramConversationBindingService();
      makeBinding(service, { workspaceId: 'ws-A', vestaraConversationId: 'conv-a' });

      expect(service.resolveConversationId('chat-1', 'p-1')).toBe('conv-a');
    });
  });

  describe('persistence across restart', () => {
    it('resolves bindings on a fresh instance', async () => {
      const store = await makeStore();
      const before = new TelegramConversationBindingService({ store });
      before.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const after = new TelegramConversationBindingService({ store });
      expect(after.resolveConversationId('chat-1', 'p-1')).toBe('conv-1');
    });

    it('enforces limits from persisted rows', async () => {
      const store = await makeStore();
      const before = new TelegramConversationBindingService({ store, maxConversationsPerChat: 1 });
      before.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const after = new TelegramConversationBindingService({ store, maxConversationsPerChat: 1 });
      expect(after.canCreateConversation('chat-1')).toBe(false);
    });

    it('pauses and closes store-only bindings', async () => {
      const store = await makeStore();
      const before = new TelegramConversationBindingService({ store });
      const binding = before.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const after = new TelegramConversationBindingService({ store });
      after.pauseBinding(binding.id);
      expect(after.getActiveBinding('chat-1', 'p-1')).toBeUndefined();
      after.resumeBinding(binding.id);
      expect(after.getActiveBinding('chat-1', 'p-1')?.vestaraConversationId).toBe('conv-1');
      after.closeBinding(binding.id);
      expect(after.getActiveBinding('chat-1', 'p-1')).toBeUndefined();
      expect(after.canCreateConversation('chat-1')).toBe(true);
    });

    it('rejects double-binding against persisted rows', async () => {
      const store = await makeStore();
      const before = new TelegramConversationBindingService({ store });
      before.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct',
        vestaraConversationId: 'conv-1',
      });

      const after = new TelegramConversationBindingService({ store });
      expect(() =>
        after.createBinding({
          principalId: 'p-1',
          workspaceId: 'ws-1',
          telegramChatId: 'chat-2',
          telegramChatType: 'direct',
          vestaraConversationId: 'conv-1',
        }),
      ).toThrow('Vestara conversation is already bound to a Telegram chat');
    });
  });

  describe('getBindingsByChat', () => {
    it('returns all bindings for a chat', () => {
      const service = new TelegramConversationBindingService();
      service.createBinding({
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'group',
        vestaraConversationId: 'conv-1',
      });
      service.createBinding({
        principalId: 'p-2',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'group',
        vestaraConversationId: 'conv-2',
      });

      const bindings = service.getBindingsByChat('chat-1');
      expect(bindings).toHaveLength(2);
    });
  });
});
