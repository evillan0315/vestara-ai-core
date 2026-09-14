import { describe, expect, it } from 'vitest';
import { triggerAssistantTurn } from '../src/assistant-turn';
import type { AgentMessageActivity } from '../src/contracts';
import type { ActivityProjectionService } from '../src/service';

function humanRecord(): AgentMessageActivity {
  return {
    id: 'activity:msg:human-1',
    sequence: 1,
    timestamp: '2026-09-14T00:00:00.000Z',
    actor: { type: 'human', id: 'you', displayName: 'You' },
    kind: 'agent-message',
    agentId: 'all-agents',
    messageKind: 'message',
    content: '@developer fix it',
    evidenceRefs: [],
  };
}

function fakeService() {
  const appended: AgentMessageActivity[] = [];
  return {
    appended,
    service: {
      appendActivity: async (record: AgentMessageActivity) => {
        appended.push(record);
        return record;
      },
    } as unknown as ActivityProjectionService,
  };
}

function fakeConversationService(responseContent: string) {
  return {
    createConversation: async () => ({ id: 'conv-1' }),
    sendMessage: async () => ({
      message: { content: '@developer fix it' },
      response: { content: responseContent, provider: 'opencode-go', model: 'muse-spark-1.3-contributor' },
      latency: 1,
    }),
  };
}

const agentStorage = {
  getAgent: async (id: string) => {
    const names: Record<string, string> = {
      'agent-assistant': 'Assistant',
      'agent-developer': 'Developer',
      'agent-reviewer': 'Reviewer',
      'agent-planner': 'Planner',
    };
    return { id, name: names[id], provider: 'opencode-go', model: 'muse-spark-1.3-contributor' };
  },
};

describe('triggerAssistantTurn agent generalization', () => {
  it('defaults to the Assistant turn (legacy AR-006 behavior)', async () => {
    const { service, appended } = fakeService();
    const result = await triggerAssistantTurn({
      humanRecord: humanRecord(),
      service,
      conversationService: fakeConversationService('on it'),
      agentStorage,
    });
    expect(result.status).toBe('completed');
    expect(result.agentId).toBe('agent-assistant');
    expect(appended).toHaveLength(1);
    expect(appended[0].actor).toMatchObject({ type: 'agent', id: 'agent-assistant', displayName: 'Assistant' });
  });

  it('runs a Developer turn with developer identity', async () => {
    const { service, appended } = fakeService();
    const result = await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord(),
      service,
      conversationService: fakeConversationService('fixed'),
      agentStorage,
    });
    expect(result.status).toBe('completed');
    expect(result.agentId).toBe('agent-developer');
    expect(appended).toHaveLength(1);
    expect(appended[0].actor).toMatchObject({ type: 'agent', id: 'agent-developer', displayName: 'Developer' });
    expect(appended[0].content).toBe('fixed');
  });

  it('fails gracefully without a conversation service, preserving agent identity', async () => {
    const { service } = fakeService();
    const result = await triggerAssistantTurn({
      agentId: 'agent-reviewer',
      humanRecord: humanRecord(),
      service,
    });
    expect(result.status).toBe('failed');
    expect(result.agentId).toBe('agent-reviewer');
  });
});
