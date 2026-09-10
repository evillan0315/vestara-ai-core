import { describe, expect, it } from 'vitest';
import { TelegramConversationBindingService } from '../src/conversation-binding';

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

      expect(binding.defaultModel).toBe('mimo-v2.5-free');
      expect(binding.defaultProvider).toBe('opencode');
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

      expect(defaults.model).toBe('mimo-v2.5-free');
      expect(defaults.provider).toBe('opencode');
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
      expect(defaults.model).toBe('mimo-v2.5-free');
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
