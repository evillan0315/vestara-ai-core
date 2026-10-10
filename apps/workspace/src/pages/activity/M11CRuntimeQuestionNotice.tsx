import { useState } from 'react';
import LiveHelpOutlinedIcon from '@mui/icons-material/LiveHelpOutlined';
import type { PendingRuntimeQuestionProjection } from '@vestara/activity-room';
import { WorkspaceOperationalPanel } from '../../components/WorkspaceOperationalPanel';
import { answerM11ARuntimeQuestion } from '../../lib/m11a-api';

interface M11CRuntimeQuestionNoticeProps {
  readonly questions: readonly PendingRuntimeQuestionProjection[];
}

type AnswerPhase = 'idle' | 'answering' | 'answered' | 'error';

/**
 * Interactive answers for one durable pending runtime question.
 *
 * Options are selectable buttons (single-select per question); Send answer
 * delivers through the live assistant interaction authority — the same
 * endpoint the Floating Assistant's question tool uses — so answering here
 * unblocks the paused runtime. Fail-closed: without exact conversation +
 * request identities no controls render, and a settled/unknown question
 * surfaces a retryable error instead of a silent no-op.
 */
function RuntimeQuestionCard({ interaction }: { readonly interaction: PendingRuntimeQuestionProjection }) {
  const [selected, setSelected] = useState<readonly (string | null)[]>(() =>
    interaction.questions.map(() => null),
  );
  const [phase, setPhase] = useState<AnswerPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const answerable = interaction.conversationId.length > 0 && interaction.openCodeRequestId.length > 0;
  const hasSelection = selected.some((label) => label !== null);
  const controlsDisabled = phase === 'answering' || phase === 'answered';

  const toggleOption = (index: number, label: string) => {
    if (controlsDisabled) return;
    setSelected((previous) =>
      previous.map((entry, position) => (position === index ? (entry === label ? null : label) : entry)),
    );
    if (phase === 'error') {
      setPhase('idle');
      setError(null);
    }
  };

  const sendAnswer = async () => {
    if (!answerable || !hasSelection || controlsDisabled) return;
    setPhase('answering');
    setError(null);
    const answers = interaction.questions.map((_, index) =>
      selected[index] === null ? [] : [selected[index] as string],
    );
    try {
      await answerM11ARuntimeQuestion(interaction.conversationId, interaction.openCodeRequestId, answers);
      setPhase('answered');
    } catch (err) {
      setPhase('error');
      const detail = err instanceof Error ? err.message : 'Answer could not be delivered.';
      setError(
        detail.includes('404')
          ? 'This question is no longer pending — it may have been answered or expired. Refresh to confirm.'
          : detail,
      );
    }
  };

  return (
    <WorkspaceOperationalPanel
      icon={<LiveHelpOutlinedIcon />}
      title="Waiting for your response"
      description="The runtime is paused until a human response is available."
      className="ar-runtime-question-panel"
    >
      {interaction.questions.map((question, index) => (
        <div className="ar-runtime-question" key={`${interaction.interactionId}:${index}`}>
          {question.header && <p className="ar-runtime-question__header">{question.header}</p>}
          <p className="ar-runtime-question__text">{question.question}</p>
          {question.options.length > 0 && (
            <ul className="ar-runtime-question__options" aria-label="Available response options">
              {question.options.map((option) => {
                const isSelected = selected[index] === option.label;
                return (
                  <li key={option.label}>
                    <button
                      type="button"
                      data-testid="runtime-question-option"
                      aria-pressed={isSelected}
                      disabled={controlsDisabled}
                      onClick={() => toggleOption(index, option.label)}
                      className={`ar-runtime-question__option-button${isSelected ? ' ar-runtime-question__option-button--selected' : ''}`}
                    >
                      <span className="ar-runtime-question__option-label">{option.label}</span>
                      {option.description && (
                        <span className="ar-runtime-question__option-description">{option.description}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      {phase === 'answered' ? (
        <p className="ar-runtime-question__sent" role="status">
          Answer sent — the runtime will continue.
        </p>
      ) : answerable ? (
        <>
          <button
            type="button"
            data-testid="runtime-question-send"
            disabled={!hasSelection || controlsDisabled}
            onClick={() => void sendAnswer()}
            className="ar-runtime-question__send"
          >
            {phase === 'answering' ? 'Sending…' : 'Send answer'}
          </button>
          {phase === 'error' && error && (
            <p className="ar-runtime-question__error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="ar-runtime-question__readonly">Response controls are unavailable for this question.</p>
      )}
    </WorkspaceOperationalPanel>
  );
}

export default function M11CRuntimeQuestionNotice({ questions }: M11CRuntimeQuestionNoticeProps) {
  if (questions.length === 0) return null;

  return (
    <div className="ar-runtime-question-stack" aria-live="polite">
      {questions.map((interaction) => (
        <RuntimeQuestionCard key={interaction.interactionId} interaction={interaction} />
      ))}
    </div>
  );
}
