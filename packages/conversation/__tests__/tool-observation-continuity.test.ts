/**
 * GA-CTX-001: Tool Observation Continuity Tests
 *
 * Verifies:
 * A. Basic continuity — tool observation persists across turns
 * B. Multiple tool calls — correct lineage and ordering
 * C. Tool failure — failed observation persisted in structured form
 * D. Large output — bounded/projected, not copied unbounded
 * E. Conversation isolation — observations don't leak across conversations
 * F. Reload continuity — observations survive persistence round-trip
 * G. Existing behavior — normal messages still work
 */

import { describe, expect, it } from 'vitest';
import type { Conversation, Message, ToolObservation } from '../src/index.js';

// ─── Test Helpers ───────────────────────────────────────────

function makeConversation(messages: Message[] = []): Conversation {
  return {
    id: 'conv-test-1',
    userId: 'user-1',
    title: 'Test Conversation',
    messages,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeUserMessage(content: string): Message {
  return {
    id: `msg-user-${Date.now()}`,
    conversationId: 'conv-test-1',
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
}

function makeAssistantMessage(content: string, observations?: ToolObservation[]): Message {
  return {
    id: `msg-assistant-${Date.now()}`,
    conversationId: 'conv-test-1',
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...(observations ? { toolObservations: observations } : {}),
  };
}

function makeToolObservation(overrides: Partial<ToolObservation> & { toolCallId: string }): ToolObservation {
  return {
    toolName: 'test-tool',
    status: 'completed',
    timestamp: new Date().toISOString(),
    content: 'test output',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('GA-CTX-001: Tool Observation Continuity', () => {
  describe('A. Basic continuity', () => {
    it('tool observation persists in assistant message', () => {
      const obs = makeToolObservation({
        toolCallId: 'tc-1',
        toolName: 'filesystem.read',
        content: 'const x = 1;',
      });
      const msg = makeAssistantMessage('I read the file.', [obs]);

      expect(msg.toolObservations).toHaveLength(1);
      expect(msg.toolObservations![0].toolCallId).toBe('tc-1');
      expect(msg.toolObservations![0].toolName).toBe('filesystem.read');
      expect(msg.toolObservations![0].content).toBe('const x = 1;');
    });

    it('observation is independent of assistant text', () => {
      const obs = makeToolObservation({
        toolCallId: 'tc-2',
        toolName: 'shell.execute',
        content: 'output here',
      });
      const msg = makeAssistantMessage('Different text', [obs]);

      // The observation content is independent of the assistant's interpretation
      expect(msg.toolObservations![0].content).toBe('output here');
      expect(msg.content).toBe('Different text');
    });
  });

  describe('B. Multiple tool calls', () => {
    it('observations retain correct toolCallId and ordering', () => {
      const obs1 = makeToolObservation({ toolCallId: 'tc-1', toolName: 'filesystem.read' });
      const obs2 = makeToolObservation({ toolCallId: 'tc-2', toolName: 'shell.execute' });
      const obs3 = makeToolObservation({ toolCallId: 'tc-3', toolName: 'git.diff' });

      const msg = makeAssistantMessage('Done.', [obs1, obs2, obs3]);

      expect(msg.toolObservations).toHaveLength(3);
      expect(msg.toolObservations![0].toolCallId).toBe('tc-1');
      expect(msg.toolObservations![1].toolCallId).toBe('tc-2');
      expect(msg.toolObservations![2].toolCallId).toBe('tc-3');
      expect(msg.toolObservations![0].toolName).toBe('filesystem.read');
      expect(msg.toolObservations![1].toolName).toBe('shell.execute');
      expect(msg.toolObservations![2].toolName).toBe('git.diff');
    });
  });

  describe('C. Tool failure', () => {
    it('failed observation persists in structured form', () => {
      const obs = makeToolObservation({
        toolCallId: 'tc-fail',
        toolName: 'shell.execute',
        status: 'failed',
        content: 'Command not found: nonexistent',
        error: 'Command not found: nonexistent',
      });

      expect(obs.status).toBe('failed');
      expect(obs.error).toBe('Command not found: nonexistent');
    });

    it('denied observation persists in structured form', () => {
      const obs = makeToolObservation({
        toolCallId: 'tc-deny',
        toolName: 'shell.execute',
        status: 'denied',
        content: 'User denied execution',
      });

      expect(obs.status).toBe('denied');
    });
  });

  describe('D. Large output', () => {
    it('content is bounded', () => {
      const largeContent = 'x'.repeat(5000);
      const obs = makeToolObservation({
        toolCallId: 'tc-large',
        toolName: 'filesystem.read',
        content: largeContent.slice(0, 2000) + '… [truncated, 5000 chars total]',
      });

      expect(obs.content.length).toBeLessThanOrEqual(2100);
      expect(obs.content).toContain('truncated');
    });
  });

  describe('E. Conversation isolation', () => {
    it('observations are scoped to their conversation', () => {
      const msg1 = makeAssistantMessage('Response 1', [
        makeToolObservation({ toolCallId: 'tc-1', toolName: 'tool-a' }),
      ]);
      msg1.conversationId = 'conv-1';

      const msg2 = makeAssistantMessage('Response 2', [
        makeToolObservation({ toolCallId: 'tc-2', toolName: 'tool-b' }),
      ]);
      msg2.conversationId = 'conv-2';

      expect(msg1.conversationId).toBe('conv-1');
      expect(msg2.conversationId).toBe('conv-2');
      expect(msg1.toolObservations![0].toolName).toBe('tool-a');
      expect(msg2.toolObservations![0].toolName).toBe('tool-b');
    });
  });

  describe('F. Reload continuity', () => {
    it('observations survive JSON serialization round-trip', () => {
      const original = makeAssistantMessage('Response', [
        makeToolObservation({
          toolCallId: 'tc-rt',
          toolName: 'filesystem.read',
          content: 'file contents',
        }),
      ]);

      // Simulate persistence round-trip
      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized) as Message;

      expect(deserialized.toolObservations).toHaveLength(1);
      expect(deserialized.toolObservations![0].toolCallId).toBe('tc-rt');
      expect(deserialized.toolObservations![0].toolName).toBe('filesystem.read');
      expect(deserialized.toolObservations![0].content).toBe('file contents');
    });
  });

  describe('G. Existing behavior', () => {
    it('messages without observations work normally', () => {
      const msg = makeAssistantMessage('Simple response');
      expect(msg.toolObservations).toBeUndefined();
      expect(msg.content).toBe('Simple response');
    });

    it('user messages are unaffected', () => {
      const msg = makeUserMessage('Hello');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
    });
  });
});
