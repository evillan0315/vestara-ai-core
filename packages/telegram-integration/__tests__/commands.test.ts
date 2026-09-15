import { describe, expect, it } from 'vitest';
import type { CommandContext, CommandServiceProviders } from '../src/commands';
import { TelegramCommandRegistry } from '../src/commands';
import type { ConversationBinding } from '../src/conversation-binding';
import type { WorkspaceBinding } from '../src/workspace-binding';

const BASE_CONTEXT: CommandContext = {
  telegramUserId: 'tg-1',
  telegramChatId: 'chat-1',
  telegramChatType: 'direct',
  args: [],
};

function authedContext(overrides?: Partial<CommandContext>): CommandContext {
  return { ...BASE_CONTEXT, principalId: 'principal-1', workspaceId: 'ws-1', ...overrides };
}

function makeWorkspaceBinding(overrides?: Partial<WorkspaceBinding>): WorkspaceBinding {
  return {
    id: 'wsb-1',
    principalId: 'principal-1',
    workspaceId: 'ws-1',
    workspaceName: 'Main',
    preferred: true,
    createdAt: '2026-09-15T00:00:00.000Z',
    lastAccessedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeConversationBinding(overrides?: Partial<ConversationBinding>): ConversationBinding {
  return {
    id: 'cb-1',
    principalId: 'principal-1',
    workspaceId: 'ws-1',
    telegramChatId: 'chat-1',
    telegramChatType: 'direct',
    vestaraConversationId: 'conv-1',
    vestaraConversationTitle: 'Token review',
    status: 'active',
    createdAt: '2026-09-15T00:00:00.000Z',
    lastActivityAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeProviders(
  workspaces: WorkspaceBinding[] = [makeWorkspaceBinding()],
  conversations: ConversationBinding[] = [makeConversationBinding()],
): CommandServiceProviders {
  return {
    workspaceBindings: {
      getBindingsByPrincipal: (principalId: string) => workspaces.filter((b) => b.principalId === principalId),
      getPreferredWorkspace: (principalId: string) =>
        workspaces.find((b) => b.principalId === principalId && b.preferred),
    },
    conversationBindings: {
      getBindingsByPrincipal: (principalId: string) => conversations.filter((b) => b.principalId === principalId),
      getActiveBinding: (chatId: string, principalId: string) =>
        conversations.find(
          (b) => b.telegramChatId === chatId && b.principalId === principalId && b.status === 'active',
        ),
    },
  };
}

describe('TelegramCommandRegistry', () => {
  describe('parseCommand', () => {
    it('parses a bare command', () => {
      const registry = new TelegramCommandRegistry();
      expect(registry.parseCommand('/status')).toEqual({ command: 'status', args: [] });
    });

    it('parses command arguments', () => {
      const registry = new TelegramCommandRegistry();
      expect(registry.parseCommand('/workspace list')).toEqual({ command: 'workspace', args: ['list'] });
    });

    it('is case-insensitive and returns null for non-commands', () => {
      const registry = new TelegramCommandRegistry();
      expect(registry.parseCommand('/Status')?.command).toBe('status');
      expect(registry.parseCommand('hello vestara')).toBeNull();
    });
  });

  describe('unknown and unauthorized commands', () => {
    it('returns a safe response for unknown commands', async () => {
      const registry = new TelegramCommandRegistry();
      const result = await registry.executeCommand('frobnicate', authedContext());

      expect(result.success).toBe(false);
      expect(result.response).toContain('/frobnicate');
      expect(result.response).toContain('/help');
    });

    it('requires pairing for authenticated commands', async () => {
      const registry = new TelegramCommandRegistry({ providers: makeProviders() });
      const result = await registry.executeCommand('status', BASE_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.response).toContain('/pair');
    });
  });

  describe('/status', () => {
    it('falls back to session context echo without providers', async () => {
      const registry = new TelegramCommandRegistry();
      const result = await registry.executeCommand('status', authedContext());

      expect(result.success).toBe(true);
      expect(result.response).toContain('Workspace: ws-1');
      expect(result.response).toContain('Principal: principal-1');
      expect(result.response).not.toContain('Conversations:');
    });

    it('reads preferred workspace and bindings from authoritative services', async () => {
      const registry = new TelegramCommandRegistry({ providers: makeProviders() });
      const result = await registry.executeCommand('status', authedContext());

      expect(result.success).toBe(true);
      expect(result.response).toContain('Workspace: Main (ws-1)');
      expect(result.response).toContain('Conversations: 1 bound');
      expect(result.response).toContain('this chat: Token review');
    });
  });

  describe('/workspace', () => {
    it('lists bound workspaces with the preferred marker', async () => {
      const registry = new TelegramCommandRegistry({
        providers: makeProviders([
          makeWorkspaceBinding(),
          makeWorkspaceBinding({ id: 'wsb-2', workspaceId: 'ws-2', workspaceName: 'Side', preferred: false }),
        ]),
      });
      const result = await registry.executeCommand('workspace', authedContext());

      expect(result.success).toBe(true);
      expect(result.response).toContain('Main (ws-1) — preferred');
      expect(result.response).toContain('Side (ws-2)');
    });

    it('shows preferred workspace info', async () => {
      const registry = new TelegramCommandRegistry({ providers: makeProviders() });
      const result = await registry.executeCommand('workspace', authedContext({ args: ['info'] }));

      expect(result.success).toBe(true);
      expect(result.response).toContain('Name: Main');
      expect(result.response).toContain('ID: ws-1');
    });

    it('reports honestly when no workspaces are bound', async () => {
      const registry = new TelegramCommandRegistry({ providers: makeProviders([], []) });
      const result = await registry.executeCommand('workspace', authedContext());

      expect(result.success).toBe(true);
      expect(result.response).toContain('No workspaces');
    });

    it('reports honestly when the service is not connected', async () => {
      const registry = new TelegramCommandRegistry();
      const result = await registry.executeCommand('workspace', authedContext());

      expect(result.success).toBe(false);
      expect(result.response).toContain('not connected');
    });
  });

  describe('/conversations', () => {
    it('lists bound conversations and marks the active chat', async () => {
      const registry = new TelegramCommandRegistry({
        providers: makeProviders(
          [makeWorkspaceBinding()],
          [
            makeConversationBinding(),
            makeConversationBinding({
              id: 'cb-2',
              telegramChatId: 'chat-2',
              vestaraConversationId: 'conv-2',
              vestaraConversationTitle: 'Planning',
              status: 'paused',
            }),
          ],
        ),
      });
      const result = await registry.executeCommand('conversations', authedContext());

      expect(result.success).toBe(true);
      expect(result.response).toContain('Token review [active] — chat chat-1 (this chat)');
      expect(result.response).toContain('Planning [paused] — chat chat-2');
    });

    it('reports honestly when nothing is bound or the service is missing', async () => {
      const empty = new TelegramCommandRegistry({ providers: makeProviders([], []) });
      const emptyResult = await empty.executeCommand('conversations', authedContext());
      expect(emptyResult.success).toBe(true);
      expect(emptyResult.response).toContain('No conversations');

      const bare = new TelegramCommandRegistry();
      const bareResult = await bare.executeCommand('conversations', authedContext());
      expect(bareResult.success).toBe(false);
      expect(bareResult.response).toContain('not connected');
    });
  });

  describe('help', () => {
    it('advertises /conversations to authenticated users', () => {
      const registry = new TelegramCommandRegistry();
      expect(registry.getFullHelp(true)).toContain('/conversations');
      expect(registry.getCommandHelp('conversations')).toContain('/conversations');
    });
  });
});
