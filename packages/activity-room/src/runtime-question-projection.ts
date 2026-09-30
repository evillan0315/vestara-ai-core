import type { AttentionEntry, PendingRuntimeQuestionProjection } from './projection-types';
import type { RuntimeQuestionInteraction } from './runtime-interaction-contract';

/** Project only active durable runtime questions; terminal states are absent. */
export function projectPendingRuntimeQuestions(
  interactions: readonly RuntimeQuestionInteraction[],
  nowMs: number = Date.now(),
): readonly PendingRuntimeQuestionProjection[] {
  const now = new Date(nowMs).toISOString();
  return interactions
    .filter(
      (interaction): interaction is RuntimeQuestionInteraction & { status: 'pending' | 'presented' } =>
        (interaction.status === 'pending' || interaction.status === 'presented') && interaction.expiresAt > now,
    )
    .map((interaction) => ({
      interactionId: interaction.interactionId,
      conversationId: interaction.conversationId,
      openCodeSessionId: interaction.openCodeSessionId,
      openCodeRequestId: interaction.openCodeRequestId,
      status: interaction.status,
      questions: interaction.questions,
      expiresAt: interaction.expiresAt,
      createdAt: interaction.createdAt,
      updatedAt: interaction.updatedAt,
    }));
}

/** Convert active durable questions into room-level attention entries. */
export function projectRuntimeQuestionAttention(
  questions: readonly PendingRuntimeQuestionProjection[],
): readonly AttentionEntry[] {
  return questions.map((question) => {
    const firstQuestion = question.questions[0];
    return {
      attentionId: `runtime-question:${question.interactionId}`,
      reason: 'waiting-for-human',
      category: 'runtime',
      severity: 'high',
      message: firstQuestion?.question || firstQuestion?.header || 'Human input required',
      sourceRecordId: question.interactionId,
      sourceRef: { kind: 'runtime-question', id: question.interactionId, owner: 'runtime-question' },
      owner: 'runtime-question',
      status: 'open',
      details: {
        conversationId: question.conversationId,
        openCodeSessionId: question.openCodeSessionId,
        openCodeRequestId: question.openCodeRequestId,
        questionCount: question.questions.length,
      },
      sessionId: question.openCodeSessionId,
      interactionId: question.interactionId,
      timestamp: question.updatedAt,
      firstObservedAt: question.createdAt,
      lastObservedAt: question.updatedAt,
      acknowledged: false,
    } satisfies AttentionEntry;
  });
}
