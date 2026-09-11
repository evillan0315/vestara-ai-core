import type { ChannelMessage } from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import type { ConversationBinding } from '../src/conversation-binding';
import { GlobalAssistantTextRouter } from '../src/global-assistant';
import type { ExecutionBackend } from '../src/global-assistant';
import type { TelegramIdentityBinding } from '../src/pairing';
import type { WorkspaceBinding } from '../src/workspace-binding';

// ─── Helpers ───────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'telegram',
    sender: {
      channel: 'telegram',
      externalId: '999',
      displayName: 'Alice',
    },
    conversation: {
      channel: 'telegram',
      externalId: '100',
      type: 'direct',
    },
    text: 'Hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<TelegramIdentityBinding> = {}): TelegramIdentityBinding {
  return {
    id: 'binding-1',
    telegramUserId: 'tg-999',
    telegramDisplayName: 'Alice',
    principalId: 'p-1',
    principalName: 'Alice Principal',
    createdAt: new Date().toISOString(),
    active: true,
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<WorkspaceBinding> = {}): WorkspaceBinding {
  return {
    id: 'ws-1',
    principalId: 'p-1',
    workspaceId: 'ws-1',
    workspaceName: 'My Workspace',
    preferred: true,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationBinding> = {}): ConversationBinding {
  return {
    id: 'conv-1',
    principalId: 'p-1',
    workspaceId: 'ws-1',
    telegramChatId: '100',
    telegramChatType: 'direct',
    vestaraConversationId: 'v-conv-1',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBackend(overrides: Partial<ExecutionBackend> = {}): ExecutionBackend {
  return {
    sendMessage: async (conversationId, content, options) => ({
      executionId: 'exec-backend-1',
      success: true,
      response: `Echo: ${content}`,
      completedAt: new Date().toISOString(),
    }),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe('GlobalAssistantTextRouter', () => {
  describe('routeMessage', () => {
    it('routes a valid message successfully', async () => {
      const router = new GlobalAssistantTextRouter();
      const result = await router.routeMessage(makeMessage(), makeIdentity(), makeWorkspace(), makeConversation());

      expect(result.status).toBe('routed');
      expect(result.executionId).toMatch(/^exec-/);
      expect(result.conversationId).toBe('v-conv-1');
    });

    it('rejects when conversation is closed', async () => {
      const router = new GlobalAssistantTextRouter();
      const result = await router.routeMessage(
        makeMessage(),
        makeIdentity(),
        makeWorkspace(),
        makeConversation({ status: 'closed' }),
      );

      expect(result.status).toBe('rejected');
      expect(result.error).toBe('Conversation is closed');
    });

    it('queues when rate limited', async () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 2 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      await router.routeMessage(makeMessage(), identity, workspace, conversation);
      await router.routeMessage(makeMessage(), identity, workspace, conversation);

      const result = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('queued');
      expect(result.queued).toBe(true);
    });

    it('rejects when concurrent execution limit reached', async () => {
      const router = new GlobalAssistantTextRouter({ maxConcurrentExecutions: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      await router.routeMessage(makeMessage(), identity, workspace, conversation);
      const result = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('rejected');
      expect(result.error).toBe('Maximum concurrent executions reached');
    });

    it('allows execution after completing previous one', async () => {
      const router = new GlobalAssistantTextRouter({ maxConcurrentExecutions: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      await router.routeMessage(makeMessage(), identity, workspace, conversation);
      router.completeExecution('p-1');

      const result = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('routed');
    });

    it('executes through backend when configured', async () => {
      const backend = makeBackend();
      const router = new GlobalAssistantTextRouter({ backend });
      const result = await router.routeMessage(makeMessage(), makeIdentity(), makeWorkspace(), makeConversation());

      expect(result.status).toBe('routed');
      expect(result.executionId).toBe('exec-backend-1');
    });

    it('handles backend failure gracefully', async () => {
      const backend: ExecutionBackend = {
        sendMessage: async () => { throw new Error('LLM unavailable'); },
      };
      const router = new GlobalAssistantTextRouter({ backend });
      const result = await router.routeMessage(makeMessage(), makeIdentity(), makeWorkspace(), makeConversation());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('LLM unavailable');
    });

    it('completes execution on backend error (concurrent slot freed)', async () => {
      const backend: ExecutionBackend = {
        sendMessage: async () => { throw new Error('fail'); },
      };
      const router = new GlobalAssistantTextRouter({ backend, maxConcurrentExecutions: 1, rateLimitPerMinute: 100 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      const first = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(first.status).toBe('failed');

      // The concurrent slot was freed by the finally block — second call
      // should NOT be rejected for concurrent limit, even though it also fails
      const second = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(second.status).toBe('failed'); // backend fails again, but NOT 'rejected'
      expect(second.error).not.toBe('Maximum concurrent executions reached');
    });
  });

  describe('buildDeliveryResponse', () => {
    it('builds a delivery from execution result', () => {
      const router = new GlobalAssistantTextRouter();
      const result = router.buildDeliveryResponse(
        {
          executionId: 'exec-1',
          success: true,
          response: 'Hello back!',
          completedAt: new Date().toISOString(),
        },
        makeConversation(),
      );

      expect(result.channel).toBe('telegram');
      expect(result.content.text).toBe('Hello back!');
      expect(result.conversation.externalId).toBe('100');
    });

    it('uses error message when response is missing', () => {
      const router = new GlobalAssistantTextRouter();
      const result = router.buildDeliveryResponse(
        {
          executionId: 'exec-1',
          success: false,
          error: 'Something went wrong',
          completedAt: new Date().toISOString(),
        },
        makeConversation(),
      );

      expect(result.content.text).toBe('Something went wrong');
    });

    it('falls back to "No response"', () => {
      const router = new GlobalAssistantTextRouter();
      const result = router.buildDeliveryResponse(
        {
          executionId: 'exec-1',
          success: true,
          completedAt: new Date().toISOString(),
        },
        makeConversation(),
      );

      expect(result.content.text).toBe('No response');
    });
  });

  describe('rate limiting', () => {
    it('tracks rate limit status', async () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 10 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      await router.routeMessage(makeMessage(), identity, workspace, conversation);

      const status = router.getRateLimitStatus('p-1');
      expect(status.count).toBe(1);
      expect(status.limit).toBe(10);
    });

    it('resets rate limit after window expires', async () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      await router.routeMessage(makeMessage(), identity, workspace, conversation);

      // Simulate window expiry
      const rateLimits = router['rateLimits'] as Map<string, { count: number; windowStart: number }>;
      const entry = rateLimits.get('p-1');
      if (entry) {
        entry.windowStart = Date.now() - 61000;
      }

      const result = await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('routed');
    });
  });

  describe('execution tracking', () => {
    it('tracks active execution count', async () => {
      const router = new GlobalAssistantTextRouter();
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      expect(router.getActiveExecutionCount('p-1')).toBe(0);

      await router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(router.getActiveExecutionCount('p-1')).toBe(1);

      router.completeExecution('p-1');
      expect(router.getActiveExecutionCount('p-1')).toBe(0);
    });

    it('does not go below zero on over-complete', () => {
      const router = new GlobalAssistantTextRouter();
      router.completeExecution('p-1');
      expect(router.getActiveExecutionCount('p-1')).toBe(0);
    });
  });
});
