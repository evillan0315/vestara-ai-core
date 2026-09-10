import type { ChannelMessage } from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import type { ConversationBinding } from '../src/conversation-binding';
import { GlobalAssistantTextRouter } from '../src/global-assistant';
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

// ─── Tests ─────────────────────────────────────────────────────

describe('GlobalAssistantTextRouter', () => {
  describe('routeMessage', () => {
    it('routes a valid message successfully', () => {
      const router = new GlobalAssistantTextRouter();
      const result = router.routeMessage(makeMessage(), makeIdentity(), makeWorkspace(), makeConversation());

      expect(result.status).toBe('routed');
      expect(result.executionId).toMatch(/^exec-/);
      expect(result.conversationId).toBe('v-conv-1');
    });

    it('rejects when conversation is closed', () => {
      const router = new GlobalAssistantTextRouter();
      const result = router.routeMessage(
        makeMessage(),
        makeIdentity(),
        makeWorkspace(),
        makeConversation({ status: 'closed' }),
      );

      expect(result.status).toBe('rejected');
      expect(result.error).toBe('Conversation is closed');
    });

    it('queues when rate limited', () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 2 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      // Send 2 messages (at limit)
      router.routeMessage(makeMessage(), identity, workspace, conversation);
      router.routeMessage(makeMessage(), identity, workspace, conversation);

      // Third should be queued
      const result = router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('queued');
      expect(result.queued).toBe(true);
    });

    it('rejects when concurrent execution limit reached', () => {
      const router = new GlobalAssistantTextRouter({ maxConcurrentExecutions: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      // First message uses up the execution slot
      router.routeMessage(makeMessage(), identity, workspace, conversation);

      // Second should be rejected (no completeExecution called)
      const result = router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('rejected');
      expect(result.error).toBe('Maximum concurrent executions reached');
    });

    it('allows execution after completing previous one', () => {
      const router = new GlobalAssistantTextRouter({ maxConcurrentExecutions: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      router.routeMessage(makeMessage(), identity, workspace, conversation);
      router.completeExecution('p-1');

      const result = router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('routed');
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
    it('tracks rate limit status', () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 10 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      router.routeMessage(makeMessage(), identity, workspace, conversation);

      const status = router.getRateLimitStatus('p-1');
      expect(status.count).toBe(1);
      expect(status.limit).toBe(10);
    });

    it('resets rate limit after window expires', async () => {
      const router = new GlobalAssistantTextRouter({ rateLimitPerMinute: 1 });
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      router.routeMessage(makeMessage(), identity, workspace, conversation);

      // Simulate window expiry by manipulating internal state
      const rateLimits = router['rateLimits'] as Map<string, { count: number; windowStart: number }>;
      const entry = rateLimits.get('p-1');
      if (entry) {
        entry.windowStart = Date.now() - 61000; // 61 seconds ago
      }

      const result = router.routeMessage(makeMessage(), identity, workspace, conversation);
      expect(result.status).toBe('routed');
    });
  });

  describe('execution tracking', () => {
    it('tracks active execution count', () => {
      const router = new GlobalAssistantTextRouter();
      const identity = makeIdentity();
      const workspace = makeWorkspace();
      const conversation = makeConversation();

      expect(router.getActiveExecutionCount('p-1')).toBe(0);

      router.routeMessage(makeMessage(), identity, workspace, conversation);
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
