import { describe, expect, it } from 'vitest';
import type { RuntimeQuestionInteraction } from '../src/runtime-interaction-contract';
import { projectPendingRuntimeQuestions, projectRuntimeQuestionAttention } from '../src/runtime-question-projection';

const base: RuntimeQuestionInteraction = {
  interactionId: 'rq-test-1',
  conversationId: 'conversation-test',
  openCodeSessionId: 'session-test',
  openCodeRequestId: 'request-test',
  questions: [
    {
      header: 'Proceed?',
      question: 'How should I proceed?',
      options: [{ label: 'Gap analysis only', description: 'Inspect without implementation.' }],
    },
  ],
  status: 'pending',
  version: 0,
  claimToken: null,
  expiresAt: '2026-09-27T12:10:00.000Z',
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
};

describe('runtime question projection', () => {
  it('projects active durable questions with structured render data', () => {
    const projected = projectPendingRuntimeQuestions([base], Date.parse('2026-09-27T12:05:00.000Z'));

    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      interactionId: base.interactionId,
      conversationId: base.conversationId,
      openCodeSessionId: base.openCodeSessionId,
      openCodeRequestId: base.openCodeRequestId,
      status: 'pending',
      questions: base.questions,
    });
  });

  it('projects room attention without creating a response authority', () => {
    const [attention] = projectRuntimeQuestionAttention(projectPendingRuntimeQuestions([base]));

    expect(attention).toMatchObject({
      reason: 'waiting-for-human',
      category: 'runtime',
      interactionId: base.interactionId,
      sourceRecordId: base.interactionId,
      sourceRef: { kind: 'runtime-question', id: base.interactionId },
    });
    expect(attention.details).not.toHaveProperty('claimToken');
  });

  it.each(['answered', 'rejected', 'expired', 'orphaned', 'delivery-unknown'] as const)(
    'omits terminal state %s',
    (status) => {
      expect(projectPendingRuntimeQuestions([{ ...base, status }])).toEqual([]);
    },
  );

  it('omits an expired pending interaction without changing its authority', () => {
    expect(projectPendingRuntimeQuestions([base], Date.parse('2026-09-27T12:10:00.000Z'))).toEqual([]);
  });
});
