import { describe, expect, it, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { TelegramPersistentStore } from '../src/persistent-store';
import { TELEGRAM_MANIFEST } from '../src/migrations';
import { migrate } from '@vestara/sqlite-migrations';

let db: any;
let store: TelegramPersistentStore;

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  migrate(db, TELEGRAM_MANIFEST);
  store = new TelegramPersistentStore(db);
});

describe('TelegramPersistentStore', () => {
  describe('pairing requests', () => {
    it('saves and retrieves a pairing request', () => {
      const request = {
        id: 'pair-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        token: 'ABC12345',
        status: 'pending' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:10:00.000Z',
      };

      store.savePairingRequest(request);
      const found = store.getPairingRequestByToken('ABC12345');

      expect(found).toBeDefined();
      expect(found!.id).toBe('pair-1');
      expect(found!.telegramUserId).toBe('tg-123');
      expect(found!.status).toBe('pending');
    });

    it('counts pending requests per user', () => {
      store.savePairingRequest({
        id: 'pair-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        token: 'TOK1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:10:00.000Z',
      });
      store.savePairingRequest({
        id: 'pair-2',
        telegramUserId: 'tg-456',
        telegramDisplayName: 'Bob',
        token: 'TOK2',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:10:00.000Z',
      });

      expect(store.countPendingByUser('tg-123')).toBe(1);
      expect(store.countPendingByUser('tg-999')).toBe(0);
    });

    it('deletes a pairing request', () => {
      store.savePairingRequest({
        id: 'pair-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        token: 'TOK1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:10:00.000Z',
      });
      store.deletePairingRequest('pair-1');
      expect(store.getPairingRequestById('pair-1')).toBeUndefined();
    });
  });

  describe('identity bindings', () => {
    it('saves and retrieves an identity binding', () => {
      const binding = {
        id: 'binding-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        principalId: 'p-1',
        principalName: 'Alice Principal',
        createdAt: '2026-01-01T00:00:00.000Z',
        active: true,
      };

      store.saveIdentityBinding(binding);
      const found = store.getIdentityBindingByTelegramId('tg-123');

      expect(found).toBeDefined();
      expect(found!.principalId).toBe('p-1');
      expect(found!.active).toBe(true);
    });

    it('finds binding by principal ID', () => {
      store.saveIdentityBinding({
        id: 'binding-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        principalId: 'p-1',
        principalName: 'Alice Principal',
        createdAt: '2026-01-01T00:00:00.000Z',
        active: true,
      });

      const found = store.getIdentityBindingByPrincipalId('p-1');
      expect(found).toBeDefined();
      expect(found!.telegramUserId).toBe('tg-123');
    });

    it('does not return inactive bindings', () => {
      store.saveIdentityBinding({
        id: 'binding-1',
        telegramUserId: 'tg-123',
        telegramDisplayName: 'Alice',
        principalId: 'p-1',
        principalName: 'Alice Principal',
        createdAt: '2026-01-01T00:00:00.000Z',
        active: false,
      });

      expect(store.getIdentityBindingByTelegramId('tg-123')).toBeUndefined();
    });
  });

  describe('workspace bindings', () => {
    it('saves and retrieves workspace bindings', () => {
      const binding = {
        id: 'ws-1',
        principalId: 'p-1',
        workspaceId: 'ws-1',
        workspaceName: 'My Workspace',
        preferred: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastAccessedAt: '2026-01-01T00:00:00.000Z',
      };

      store.saveWorkspaceBinding(binding);
      const found = store.getWorkspaceBinding('p-1', 'ws-1');

      expect(found).toBeDefined();
      expect(found!.workspaceName).toBe('My Workspace');
      expect(found!.preferred).toBe(true);
    });

    it('enforces unique principal+workspace constraint', () => {
      store.saveWorkspaceBinding({
        id: 'ws-1',
        principalId: 'p-1',
        workspaceId: 'ws-1',
        workspaceName: 'WS 1',
        preferred: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastAccessedAt: '2026-01-01T00:00:00.000Z',
      });
      // Second save with same principal+workspace replaces
      store.saveWorkspaceBinding({
        id: 'ws-2',
        principalId: 'p-1',
        workspaceId: 'ws-1',
        workspaceName: 'WS 1 Updated',
        preferred: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastAccessedAt: '2026-01-02T00:00:00.000Z',
      });

      const all = store.getWorkspaceBindingsByPrincipal('p-1');
      expect(all).toHaveLength(1);
      expect(all[0].workspaceName).toBe('WS 1 Updated');
    });

    it('clears preferred workspace', () => {
      store.saveWorkspaceBinding({
        id: 'ws-1', principalId: 'p-1', workspaceId: 'ws-1', workspaceName: 'WS 1',
        preferred: true, createdAt: '2026-01-01T00:00:00.000Z', lastAccessedAt: '2026-01-01T00:00:00.000Z',
      });
      store.saveWorkspaceBinding({
        id: 'ws-2', principalId: 'p-1', workspaceId: 'ws-2', workspaceName: 'WS 2',
        preferred: true, createdAt: '2026-01-01T00:00:00.000Z', lastAccessedAt: '2026-01-01T00:00:00.000Z',
      });

      store.clearPreferredWorkspace('p-1');
      const bindings = store.getWorkspaceBindingsByPrincipal('p-1');
      expect(bindings.every((b) => !b.preferred)).toBe(true);
    });
  });

  describe('conversation bindings', () => {
    it('saves and retrieves a conversation binding', () => {
      const binding = {
        id: 'conv-1',
        principalId: 'p-1',
        workspaceId: 'ws-1',
        telegramChatId: 'chat-1',
        telegramChatType: 'direct' as const,
        vestaraConversationId: 'v-conv-1',
        status: 'active' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastActivityAt: '2026-01-01T00:00:00.000Z',
      };

      store.saveConversationBinding(binding);
      const found = store.getConversationBinding('conv-1');

      expect(found).toBeDefined();
      expect(found!.telegramChatId).toBe('chat-1');
      expect(found!.status).toBe('active');
    });

    it('finds active binding for chat+principal', () => {
      store.saveConversationBinding({
        id: 'conv-1', principalId: 'p-1', workspaceId: 'ws-1',
        telegramChatId: 'chat-1', telegramChatType: 'direct',
        vestaraConversationId: 'v-conv-1', status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z', lastActivityAt: '2026-01-01T00:00:00.000Z',
      });
      store.saveConversationBinding({
        id: 'conv-2', principalId: 'p-1', workspaceId: 'ws-1',
        telegramChatId: 'chat-1', telegramChatType: 'direct',
        vestaraConversationId: 'v-conv-2', status: 'closed',
        createdAt: '2026-01-01T00:00:00.000Z', lastActivityAt: '2026-01-01T00:00:00.000Z',
      });

      const active = store.getActiveConversationBinding('chat-1', 'p-1');
      expect(active!.id).toBe('conv-1');
    });

    it('counts active bindings per chat', () => {
      store.saveConversationBinding({
        id: 'conv-1', principalId: 'p-1', workspaceId: 'ws-1',
        telegramChatId: 'chat-1', telegramChatType: 'group',
        vestaraConversationId: 'v-conv-1', status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z', lastActivityAt: '2026-01-01T00:00:00.000Z',
      });
      store.saveConversationBinding({
        id: 'conv-2', principalId: 'p-2', workspaceId: 'ws-1',
        telegramChatId: 'chat-1', telegramChatType: 'group',
        vestaraConversationId: 'v-conv-2', status: 'closed',
        createdAt: '2026-01-01T00:00:00.000Z', lastActivityAt: '2026-01-01T00:00:00.000Z',
      });

      expect(store.countActiveByChat('chat-1')).toBe(1);
    });
  });
});
