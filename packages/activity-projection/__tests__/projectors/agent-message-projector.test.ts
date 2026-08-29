import { AgentMessageProjector } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from '../helpers';

const projector = new AgentMessageProjector();

describe('AgentMessageProjector', () => {
  it('supports messages, invocations, tool calls, and approval decisions', () => {
    expect(projector.supports(sourceEvent({ type: 'harness.agent-message' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.turn.started' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.tool-call' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.approval.resolved' }))).toBe(true);
  });

  it('does not project verification events (they belong to other projectors)', () => {
    expect(projector.supports(sourceEvent({ type: 'harness.verification.completed' }))).toBe(false);
    expect(projector.supports(sourceEvent({ type: 'harness.verification-result' }))).toBe(false);
    expect(projector.supports(sourceEvent({ type: 'harness.revision.requested' }))).toBe(false);
    expect(projector.supports(sourceEvent({ type: 'project.phase.changed' }))).toBe(false);
  });

  it('projects an agent message with content', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'harness.agent-message',
        actorId: 'engineer',
        authority: 'agent',
        taskId: 'task-3',
        threadId: 'thread-1',
        turnId: 'turn-2',
        payload: { agentId: 'engineer', content: 'Fixed the failing check' },
      }),
    );
    if (record.kind !== 'agent-message') throw new Error('expected agent-message activity');
    expect(record.agentId).toBe('engineer');
    expect(record.messageKind).toBe('message');
    expect(record.content).toBe('Fixed the failing check');
    expect(record.actor.type).toBe('agent');
    expect(record.taskId).toBe('task-3');
  });

  it('projects a tool call with tool name and risk', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'harness.tool-call',
        payload: { agentId: 'engineer', toolName: 'filesystem.write', risk: 'high' },
      }),
    );
    if (record.kind !== 'agent-message') throw new Error('expected agent-message activity');
    expect(record.messageKind).toBe('tool-call');
    expect(record.toolName).toBe('filesystem.write');
    expect(record.risk).toBe('high');
  });

  it('projects a turn start as an invocation', () => {
    const [record] = projector.project(sourceEvent({ type: 'harness.turn.started', payload: { agentId: 'engineer' } }));
    if (record.kind !== 'agent-message') throw new Error('expected agent-message activity');
    expect(record.messageKind).toBe('invocation');
    expect(record.content).toBe('Turn started');
  });
});
