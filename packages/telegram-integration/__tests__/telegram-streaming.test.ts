/**
 * VES-TG-STREAM — Telegram streaming router regression tests.
 *
 * Proves:
 *   1. routeStream forwards backend text deltas to the sink in order,
 *      with the full accumulated response.
 *   2. Backends without streaming fall back to sendMessage with a single
 *      onText + onComplete delivery.
 *   3. Gating matches routeMessage: closed conversations reject before
 *      any sink callback fires.
 *   4. The stream path asserts target-agent identity only (no
 *      provider/model reaches the backend).
 */

import type { ChannelMessage } from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import type { ConversationBinding } from '../src/conversation-binding';
import {
  type ExecutionBackend,
  GlobalAssistantTextRouter,
  type StreamSink,
  TELEGRAM_ASSISTANT_AGENT_ID,
} from '../src/global-assistant';
import type { TelegramIdentityBinding } from '../src/pairing';
import type { WorkspaceBinding } from '../src/workspace-binding';

// ─── Fixtures ────────────────────────────────────────────────────

function channelMessage(text: string): ChannelMessage {
  return {
    id: 'tg-msg-stream-1',
    channel: 'telegram',
    externalMessageId: 'ext-stream-1',
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

const conversation: ConversationBinding = {
  id: 'conv-bind-1',
  principalId: 'principal-1',
  workspaceId: 'workspace-1',
  telegramChatId: 'tg-chat-1',
  telegramChatType: 'direct',
  vestaraConversationId: 'vestara-conv-1',
  status: 'active',
  createdAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
};

function recordingSink(): { sink: StreamSink; starts: string[]; texts: string[]; completes: string[] } {
  const starts: string[] = [];
  const texts: string[] = [];
  const completes: string[] = [];
  const sink: StreamSink = {
    onStart: (executionId) => {
      starts.push(executionId);
    },
    onText: (fullText) => {
      texts.push(fullText);
    },
    onComplete: (fullText) => {
      completes.push(fullText);
    },
  };
  return { sink, starts, texts, completes };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('routeStream', () => {
  it('forwards streaming deltas to the sink with accumulated text', async () => {
    const seenOptions: unknown[] = [];
    const backend: ExecutionBackend = {
      sendMessage: async () => {
        throw new Error('stream path must not call sendMessage');
      },
      streamMessage: async function* (conversationId, _content, options) {
        seenOptions.push({ conversationId, options });
        yield 'Hello';
        yield ' world';
      },
    };
    const router = new GlobalAssistantTextRouter({ backend });
    const rec = recordingSink();

    const result = await router.routeStream(channelMessage('hi'), identity, workspace, conversation, rec.sink);

    expect(result.status).toBe('routed');
    expect(result.response).toBe('Hello world');
    expect(result.conversationId).toBe('vestara-conv-1');
    expect(rec.starts).toHaveLength(1);
    expect(rec.texts).toEqual(['Hello', 'Hello world']);
    expect(rec.completes).toEqual(['Hello world']);
    // Target-agent identity only — never provider/model.
    expect(seenOptions).toEqual([
      { conversationId: 'vestara-conv-1', options: { agentId: TELEGRAM_ASSISTANT_AGENT_ID } },
    ]);
  });

  it('falls back to sendMessage with a single delivery when streaming is unavailable', async () => {
    const backend: ExecutionBackend = {
      sendMessage: async () => ({
        executionId: 'exec-backend-1',
        success: true,
        response: 'full reply',
        completedAt: new Date().toISOString(),
      }),
    };
    const router = new GlobalAssistantTextRouter({ backend });
    const rec = recordingSink();

    const result = await router.routeStream(channelMessage('hi'), identity, workspace, conversation, rec.sink);

    expect(result.status).toBe('routed');
    expect(result.executionId).toBe('exec-backend-1');
    expect(result.response).toBe('full reply');
    expect(rec.starts).toHaveLength(1);
    expect(rec.texts).toEqual(['full reply']);
    expect(rec.completes).toEqual(['full reply']);
  });

  it('rejects closed conversations before any sink callback fires', async () => {
    let backendUsed = false;
    const backend: ExecutionBackend = {
      sendMessage: async () => {
        backendUsed = true;
        throw new Error('must not execute');
      },
      streamMessage: async function* () {
        backendUsed = true;
        yield 'must not execute';
      },
    };
    const router = new GlobalAssistantTextRouter({ backend });
    const rec = recordingSink();
    const closed: ConversationBinding = { ...conversation, status: 'closed' };

    const result = await router.routeStream(channelMessage('hi'), identity, workspace, closed, rec.sink);

    expect(result.status).toBe('rejected');
    expect(backendUsed).toBe(false);
    expect(rec.starts).toHaveLength(0);
    expect(rec.texts).toHaveLength(0);
    expect(rec.completes).toHaveLength(0);
  });

  it('skips empty deltas without notifying the sink', async () => {
    const backend: ExecutionBackend = {
      sendMessage: async () => {
        throw new Error('stream path must not call sendMessage');
      },
      streamMessage: async function* () {
        yield '';
        yield 'text';
      },
    };
    const router = new GlobalAssistantTextRouter({ backend });
    const rec = recordingSink();

    const result = await router.routeStream(channelMessage('hi'), identity, workspace, conversation, rec.sink);

    expect(result.response).toBe('text');
    expect(rec.texts).toEqual(['text']);
    expect(rec.completes).toEqual(['text']);
  });
});
