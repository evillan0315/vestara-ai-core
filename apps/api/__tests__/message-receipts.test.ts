import type { AgentMessageActivity } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import {
  markMessageObserved,
  messageTargetsAgent,
  receiptsForMessage,
  registerMessage,
  unreadCountsForWorkflow,
} from '../src/message-receipts';

function humanMessage(id: string, content: string, workflowId: string): AgentMessageActivity {
  return {
    id,
    sequence: 0,
    timestamp: new Date().toISOString(),
    actor: { type: 'human', id: 'alice', displayName: 'Alice' },
    kind: 'agent-message',
    agentId: 'all-agents',
    messageKind: 'message',
    content,
    workflowId,
    evidenceRefs: [],
  };
}

describe('messageTargetsAgent', () => {
  it('matches @mention aliases', () => {
    expect(messageTargetsAgent('@developer please fix', 'vestara-developer', 'developer')).toBe(true);
    expect(messageTargetsAgent('@developer-agent fix this', 'vestara-developer', 'developer')).toBe(true);
    expect(messageTargetsAgent('@vestara-developer go', 'vestara-developer', 'developer')).toBe(true);
  });

  it('does not match other agents', () => {
    expect(messageTargetsAgent('@developer please fix', 'vestara-verifier', 'verifier')).toBe(false);
    expect(messageTargetsAgent('no mention here', 'vestara-developer', 'developer')).toBe(false);
  });
});

describe('registerMessage + receipts', () => {
  it('marks broadcast messages pending and @mention targets addressed', () => {
    const roles = new Map([
      ['vestara-planner', 'planner'],
      ['vestara-developer', 'developer'],
    ]);
    registerMessage(
      humanMessage('m1', 'Do not change the API.', 'wf-1'),
      ['vestara-planner', 'vestara-developer'],
      roles,
    );

    const byAgent = new Map(receiptsForMessage('m1').map((r) => [r.agentId, r]));
    expect(byAgent.get('vestara-planner')?.state).toBe('pending');
    expect(byAgent.get('vestara-developer')?.state).toBe('pending');
  });

  it('marks an @mention target as addressed', () => {
    const roles = new Map([['vestara-developer', 'developer']]);
    registerMessage(humanMessage('m2', '@developer confirm the API', 'wf-1'), ['vestara-developer'], roles);
    const receipt = receiptsForMessage('m2')[0];
    expect(receipt.state).toBe('addressed');
  });

  it('tracks observation and unread counts', () => {
    const roles = new Map([['vestara-developer', 'developer']]);
    registerMessage(humanMessage('m3', 'no mention', 'wf-1'), ['vestara-developer'], roles);
    // m1 (broadcast, pending) + m3 (broadcast, pending) → 2 unread for developer.
    expect(unreadCountsForWorkflow('wf-1')['vestara-developer']).toBe(2);

    markMessageObserved('m3', 'vestara-developer');
    expect(receiptsForMessage('m3')[0].state).toBe('observed');
    expect(receiptsForMessage('m3')[0].observedAt).toBeDefined();
    expect(unreadCountsForWorkflow('wf-1')['vestara-developer']).toBe(1);
  });
});
