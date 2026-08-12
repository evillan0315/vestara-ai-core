import { describe, expect, it } from 'vitest';
import { classifyOpenCodeExecutionEvent } from '../src/execution-normalizer.js';

function openCodeEvent(type: string, payload: Record<string, unknown> = {}) {
  return { id: `evt-${type}-${Math.random()}`, type, payload };
}

describe('OpenCode SSE → Vestara execution-event normalization', () => {
  it('maps streaming deltas to agent.progress / reasoning', () => {
    const event = classifyOpenCodeExecutionEvent(
      openCodeEvent('message.part.delta', { sessionID: 's-1', delta: 'Plan: ' }),
    );
    expect(event?.type).toBe('agent.progress');
    expect(event?.executionState).toBe('reasoning');
    expect(event?.sessionId).toBe('s-1');
  });

  it('maps heartbeats to agent.activity / active (connection liveness)', () => {
    const event = classifyOpenCodeExecutionEvent(openCodeEvent('server.heartbeat'));
    expect(event?.type).toBe('agent.activity');
    expect(event?.executionState).toBe('active');
  });

  it('maps tool events to tool activity / active', () => {
    const started = classifyOpenCodeExecutionEvent(openCodeEvent('tool.started', { toolName: 'filesystem.read' }));
    expect(started?.type).toBe('tool.started');
    expect(started?.executionState).toBe('active');
    expect(started?.activity).toContain('filesystem.read');
  });

  it('maps session.idle to agent.completed and session.error to agent.failed', () => {
    expect(classifyOpenCodeExecutionEvent(openCodeEvent('session.idle', { sessionID: 's-1' }))?.executionState).toBe(
      'completed',
    );
    expect(classifyOpenCodeExecutionEvent(openCodeEvent('session.error', { sessionID: 's-1' }))?.executionState).toBe(
      'failed',
    );
  });

  it('drops events with no participant-visible signal', () => {
    expect(classifyOpenCodeExecutionEvent(openCodeEvent('server.connected'))).toBeUndefined();
  });
});
