import { describe, expect, it } from 'vitest';
import type { ExecutionUpdate } from '../src/execution-projection';
import { TelegramExecutionProjection } from '../src/execution-projection';

function makeUpdate(overrides?: Partial<ExecutionUpdate>): ExecutionUpdate {
  return {
    executionId: 'exec-1',
    vestaraConversationId: 'conv-1',
    status: 'executing',
    timestamp: '2026-09-15T13:00:00.000Z',
    ...overrides,
  };
}

describe('TelegramExecutionProjection', () => {
  describe('start', () => {
    it('projects a queued update and tracks it as active', () => {
      const projection = new TelegramExecutionProjection();
      const delivery = projection.projectUpdate(makeUpdate({ status: 'queued' }), 'chat-1');

      expect(delivery).not.toBeNull();
      expect(delivery!.conversation.externalId).toBe('chat-1');
      expect(delivery!.content.text).toContain('Queued');
      expect(projection.isActive('exec-1')).toBe(true);
      expect(projection.getExecutionStatus('exec-1')?.status).toBe('queued');
    });
  });

  describe('progress', () => {
    it('renders progress percent at detailed level', () => {
      const projection = new TelegramExecutionProjection();
      const delivery = projection.projectUpdate(
        makeUpdate({ message: 'Writing files', progressPercent: 42 }),
        'chat-1',
        'detailed',
      );

      expect(delivery!.content.text).toContain('Writing files');
      expect(delivery!.content.text).toContain('Progress: 42%');
    });

    it('omits progress percent at brief level', () => {
      const projection = new TelegramExecutionProjection();
      const delivery = projection.projectUpdate(makeUpdate({ progressPercent: 42 }), 'chat-1', 'brief');

      expect(delivery!.content.text).not.toContain('Progress:');
    });
  });

  describe('completion', () => {
    it('releases the execution from active tracking on terminal status', () => {
      const projection = new TelegramExecutionProjection();
      projection.projectUpdate(makeUpdate({ status: 'executing' }), 'chat-1');

      const delivery = projection.projectUpdate(
        makeUpdate({ status: 'completed', timestamp: '2026-09-15T13:01:00.000Z' }),
        'chat-1',
      );

      expect(delivery!.content.text).toContain('Completed');
      expect(projection.isActive('exec-1')).toBe(false);
      expect(projection.getActiveExecutions()).toHaveLength(0);
    });

    it('projects a completion summary unless disabled', () => {
      const projection = new TelegramExecutionProjection();
      const delivery = projection.projectCompletion('exec-1', 'All checks green', 'chat-1');

      expect(delivery!.content.text).toContain('Execution Complete');
      expect(delivery!.content.text).toContain('All checks green');

      const silent = new TelegramExecutionProjection({ sendCompletionMessage: false });
      expect(silent.projectCompletion('exec-1', 'All checks green', 'chat-1')).toBeNull();
    });
  });

  describe('failure', () => {
    it('marks failure deliveries high priority and releases tracking', () => {
      const projection = new TelegramExecutionProjection();
      projection.projectUpdate(makeUpdate({ status: 'executing' }), 'chat-1');

      const delivery = projection.projectUpdate(
        makeUpdate({ status: 'failed', message: 'Build broke', timestamp: '2026-09-15T13:02:00.000Z' }),
        'chat-1',
      );

      expect(delivery!.priority).toBe('high');
      expect(delivery!.content.text).toContain('Failed');
      expect(projection.isActive('exec-1')).toBe(false);
    });

    it('projects a failure message unless disabled', () => {
      const projection = new TelegramExecutionProjection();
      const delivery = projection.projectFailure('exec-1', 'Build broke', 'chat-1');

      expect(delivery!.content.text).toContain('Execution Failed');
      expect(delivery!.content.text).toContain('Build broke');

      const silent = new TelegramExecutionProjection({ sendFailureMessage: false });
      expect(silent.projectFailure('exec-1', 'Build broke', 'chat-1')).toBeNull();
    });
  });

  describe('stale events', () => {
    it('drops out-of-order updates without emitting', () => {
      const projection = new TelegramExecutionProjection();
      projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T13:00:00.000Z' }), 'chat-1');

      const stale = projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T12:59:00.000Z' }), 'chat-1');

      expect(stale).toBeNull();
      expect(projection.getExecutionStatus('exec-1')?.timestamp).toBe('2026-09-15T13:00:00.000Z');
    });

    it('drops equal-timestamp duplicates', () => {
      const projection = new TelegramExecutionProjection();
      projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T13:00:00.000Z' }), 'chat-1');

      expect(projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T13:00:00.000Z' }), 'chat-1')).toBeNull();
    });

    it('accepts newer updates and never treats unparseable timestamps as stale', () => {
      const projection = new TelegramExecutionProjection();
      projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T13:00:00.000Z' }), 'chat-1');

      expect(projection.projectUpdate(makeUpdate({ timestamp: '2026-09-15T13:01:00.000Z' }), 'chat-1')).not.toBeNull();
      expect(projection.projectUpdate(makeUpdate({ timestamp: 'not-a-time' }), 'chat-1')).not.toBeNull();
    });
  });

  describe('provenance', () => {
    it('carries execution and conversation provenance in rendered output', () => {
      const projection = new TelegramExecutionProjection({ includeTimestamps: false });
      const delivery = projection.projectUpdate(makeUpdate(), 'chat-1', 'brief');

      expect(delivery!.content.text).toContain('Execution exec-1 · Conversation conv-1');
    });

    it('still identifies the execution when no conversation is bound', () => {
      const projection = new TelegramExecutionProjection({ includeTimestamps: false });
      const { vestaraConversationId: _dropped, ...withoutConversation } = makeUpdate();
      const delivery = projection.projectUpdate(withoutConversation, 'chat-1', 'brief');

      expect(delivery!.content.text).toContain('Execution exec-1');
    });

    it('omits provenance at none level', () => {
      const projection = new TelegramExecutionProjection({ includeTimestamps: false });
      const delivery = projection.projectUpdate(makeUpdate(), 'chat-1', 'none');

      expect(delivery!.content.text).not.toContain('exec-1');
    });
  });
});
