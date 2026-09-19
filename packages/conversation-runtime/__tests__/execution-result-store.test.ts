import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Conversation, Message } from '@vestara/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteConversationStore } from '../src';

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('SqliteConversationStore execution attribution', () => {
  it('preserves per-message execution attribution after reload', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'vestara-conversation-'));
    const dbPath = join(tempDir, 'conversations.db');
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: 'conv-1',
      userId: 'local',
      title: 'Test',
      messages: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const message: Message = {
      id: 'msg-1',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'done',
      provider: 'openai-codex',
      createdAt: now,
      executionResult: {
        termination: 'completed',
        toolCallCount: 0,
        elapsedMs: 12,
        execution: { runtimeId: 'codex', providerId: 'openai-codex' },
      },
    };

    const writer = new SqliteConversationStore({ dbPath });
    await writer.initialize();
    await writer.create(conversation);
    await writer.addMessage(conversation.id, message);

    const reader = new SqliteConversationStore({ dbPath });
    await reader.initialize();
    const reloaded = await reader.getConversation(conversation.id);

    expect(reloaded?.messages[0]?.executionResult?.execution).toEqual({
      runtimeId: 'codex',
      providerId: 'openai-codex',
    });
    expect(reloaded?.messages[0]?.model).toBeUndefined();
  });
});
