/**
 * ROUTING-CONVERGENCE-001A — Telegram routing authority regression tests.
 *
 * Proves:
 *   1. Telegram cannot inject a Telegram-local Muse binding (no model/provider
 *      reaches the execution backend — target-agent identity only).
 *   2. The generic Telegram Assistant path targets canonical agent-assistant.
 *   3. Legacy persisted default_model/default_provider values (including Muse
 *      rows written before the fix) cannot influence execution: writes are
 *      NULLed and reads ignore the cells.
 */

import type { ChannelMessage } from '@vestara/channel-types';
import { describe, expect, it, vi } from 'vitest';
import { TelegramConversationBindingService } from '../src/conversation-binding';
import { type ExecutionBackend, GlobalAssistantTextRouter, TELEGRAM_ASSISTANT_AGENT_ID } from '../src/global-assistant';
import type { TelegramIdentityBinding } from '../src/pairing';
import { TelegramPersistentStore } from '../src/persistent-store';
import type { WorkspaceBinding } from '../src/workspace-binding';

// ─── Fixtures ────────────────────────────────────────────────────

function channelMessage(text: string): ChannelMessage {
  return {
    id: 'tg-msg-1',
    channel: 'telegram',
    externalMessageId: 'ext-1',
    sender: { channel: 'telegram', externalId: 'tg-user-1', displayName: 'TG User' },
    conversation: { channel: 'telegram', externalId: 'tg-chat-1', type: 'direct' },
    text,
    timestamp: new Date().toISOString(),
  };
}

const identity: TelegramIdentityBinding = {
  id: 'pair-1',
  telegramUserId: 'tg-user-1',
  telegramDisplayName: 'TG User',
  principalId: 'principal-1',
  principalName: 'Principal One',
  createdAt: new Date().toISOString(),
  active: true,
};

const workspace: WorkspaceBinding = {
  id: 'ws-1',
  principalId: 'principal-1',
  workspaceId: 'workspace-1',
  workspaceName: 'workspace-1',
  preferred: true,
  createdAt: new Date().toISOString(),
  lastAccessedAt: new Date().toISOString(),
};

function capturingBackend(): { backend: ExecutionBackend; calls: Array<{ conversationId: string; options: unknown }> } {
  const calls: Array<{ conversationId: string; options: unknown }> = [];
  const backend: ExecutionBackend = {
    sendMessage: async (conversationId, content, options) => {
      calls.push({ conversationId, options });
      return {
        executionId: 'exec-test-1',
        success: true,
        response: `echo: ${content}`,
        completedAt: new Date().toISOString(),
      };
    },
  };
  return { backend, calls };
}

// Minimal sql.js-shaped stub: implements prepare/bind/step/getAsObject/free
// for exactly the conversation-binding statements the store issues.
const CONV_COLUMNS = [
  'id',
  'principal_id',
  'workspace_id',
  'telegram_chat_id',
  'telegram_chat_type',
  'telegram_chat_title',
  'vestara_conversation_id',
  'vestara_conversation_title',
  'status',
  'created_at',
  'last_activity_at',
  'default_model',
  'default_provider',
] as const;

function createFakeConversationDb() {
  const rows = new Map<string, Record<string, unknown>>();

  function match(sql: string, params: unknown[]): Record<string, unknown>[] {
    const all = Array.from(rows.values());
    if (sql.includes('WHERE telegram_chat_id = ? AND principal_id = ?')) {
      return all.filter(
        (r) => r.telegram_chat_id === params[0] && r.principal_id === params[1] && r.status === params[2],
      );
    }
    if (sql.includes('WHERE id = ?')) {
      return all.filter((r) => r.id === params[0]);
    }
    if (sql.includes('WHERE telegram_chat_id = ?')) {
      return all.filter((r) => r.telegram_chat_id === params[0]);
    }
    if (sql.includes('WHERE principal_id = ?')) {
      return all.filter((r) => r.principal_id === params[0]);
    }
    return [];
  }

  const db = {
    rows,
    prepare(sql: string) {
      let params: unknown[] = [];
      let started = false;
      let result: Record<string, unknown>[] = [];
      let cursor = 0;
      return {
        bind(p: unknown[]) {
          params = p;
        },
        step() {
          if (sql.startsWith('INSERT OR REPLACE INTO telegram_conversation_bindings')) {
            const row: Record<string, unknown> = {};
            CONV_COLUMNS.forEach((col, i) => {
              row[col] = params[i];
            });
            rows.set(String(params[0]), row);
            return false;
          }
          if (!started) {
            started = true;
            result = match(sql, params);
            cursor = 0;
          }
          if (cursor < result.length) {
            cursor += 1;
            return true;
          }
          return false;
        },
        getAsObject() {
          if (sql.startsWith('INSERT OR REPLACE')) return {};
          if (!started) {
            started = true;
            result = match(sql, params);
            cursor = 0;
          }
          return result[cursor - 1] ?? result[0] ?? null;
        },
        free() {},
      };
    },
  };
  return db;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ROUTING-CONVERGENCE-001A: Telegram has no model authority', () => {
  it('targets canonical agent-assistant and sends no provider/model', async () => {
    expect(TELEGRAM_ASSISTANT_AGENT_ID).toBe('agent-assistant');
    const { backend, calls } = capturingBackend();
    const router = new GlobalAssistantTextRouter({ backend });
    const bindings = new TelegramConversationBindingService();
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });

    const result = await router.routeMessage(channelMessage('hello'), identity, workspace, binding);

    expect(result.status).toBe('routed');
    expect(calls).toHaveLength(1);
    expect(calls[0].conversationId).toBe('conv-1');
    // Target-agent identity only — no provider/model keys may reach execution.
    expect(calls[0].options).toEqual({ agentId: 'agent-assistant' });
  });

  it('ignores legacy model fields stuck onto a binding (pre-fix rows)', async () => {
    const { backend, calls } = capturingBackend();
    const router = new GlobalAssistantTextRouter({ backend });
    const bindings = new TelegramConversationBindingService();
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });
    const legacyShaped = {
      ...binding,
      defaultModel: 'muse-spark-1.3-contributor',
      defaultProvider: 'opencode-go',
    } as unknown as typeof binding;

    await router.routeMessage(channelMessage('hello'), identity, workspace, legacyShaped);

    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ agentId: 'agent-assistant' });
  });

  it('ignores hostile Telegram-local defaults passed as config', async () => {
    const { backend, calls } = capturingBackend();
    const router = new GlobalAssistantTextRouter({
      backend,
      defaultModel: 'muse-spark-1.3-contributor',
      defaultProvider: 'opencode-go',
    } as unknown as ConstructorParameters<typeof GlobalAssistantTextRouter>[0]);
    const bindings = new TelegramConversationBindingService();
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });

    await router.routeMessage(channelMessage('hello'), identity, workspace, binding);

    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual({ agentId: 'agent-assistant' });
  });

  it('createBinding stamps identity only — no model/provider keys', () => {
    const bindings = new TelegramConversationBindingService();
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });

    expect('defaultModel' in binding).toBe(false);
    expect('defaultProvider' in binding).toBe(false);
  });
});

describe('ROUTING-CONVERGENCE-001A: legacy persisted model cells are dead', () => {
  it('writes NULL legacy cells and ignores pre-existing Muse cell values on read', () => {
    const db = createFakeConversationDb();
    const store = new TelegramPersistentStore(db);
    const bindings = new TelegramConversationBindingService({ store });
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });

    const raw = db.rows.get(binding.id);
    expect(raw).toBeDefined();
    // Retained columns, permanently NULL.
    expect(raw?.default_model).toBeNull();
    expect(raw?.default_provider).toBeNull();

    // Simulate a pre-fix row: legacy Muse values sitting in the cells.
    raw!.default_model = 'muse-spark-1.3-contributor';
    raw!.default_provider = 'opencode-go';

    const reloaded = store.getConversationBinding(binding.id);
    expect(reloaded).toBeDefined();
    expect('defaultModel' in (reloaded as object)).toBe(false);
    expect('defaultProvider' in (reloaded as object)).toBe(false);

    // The service-level read path also drops them.
    const viaService = bindings.getBinding(binding.id);
    expect('defaultModel' in (viaService as object)).toBe(false);
    expect('defaultProvider' in (viaService as object)).toBe(false);
  });

  it('Muse string never appears in router output for a legacy-loaded binding', async () => {
    const db = createFakeConversationDb();
    const store = new TelegramPersistentStore(db);
    const bindings = new TelegramConversationBindingService({ store });
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });
    const raw = db.rows.get(binding.id);
    raw!.default_model = 'muse-spark-1.3-contributor';
    raw!.default_provider = 'opencode-go';

    // Fresh service instance over the same store (post-restart shape).
    const reloaded = new TelegramConversationBindingService({ store });
    const active = reloaded.getActiveBinding('tg-chat-1', 'principal-1', 'workspace-1');
    expect(active).toBeDefined();

    const { backend, calls } = capturingBackend();
    const router = new GlobalAssistantTextRouter({ backend });
    await router.routeMessage(channelMessage('hello'), identity, workspace, active!);

    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0].options)).not.toContain('muse-spark');
    expect(JSON.stringify(calls[0].options)).not.toContain('opencode-go');
  });
});

describe('ROUTING-CONVERGENCE-001A: router contract', () => {
  it('exposes a spyable backend boundary (vi)', async () => {
    const sendMessage = vi.fn(async () => ({
      executionId: 'exec-spy',
      success: true,
      response: 'ok',
      completedAt: new Date().toISOString(),
    }));
    const router = new GlobalAssistantTextRouter({ backend: { sendMessage } });
    const bindings = new TelegramConversationBindingService();
    const binding = bindings.createBinding({
      principalId: 'principal-1',
      workspaceId: 'workspace-1',
      telegramChatId: 'tg-chat-1',
      telegramChatType: 'direct',
      vestaraConversationId: 'conv-1',
    });

    await router.routeMessage(channelMessage('hi'), identity, workspace, binding);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('conv-1', 'hi', { agentId: 'agent-assistant' });
  });
});
