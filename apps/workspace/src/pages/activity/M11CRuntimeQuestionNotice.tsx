import LiveHelpOutlinedIcon from '@mui/icons-material/LiveHelpOutlined';
import type { PendingRuntimeQuestionProjection } from '@vestara/activity-room';
import { WorkspaceOperationalPanel } from '../../components/WorkspaceOperationalPanel';

interface M11CRuntimeQuestionNoticeProps {
  readonly questions: readonly PendingRuntimeQuestionProjection[];
}

/** Read-only presentation of durable pending runtime questions. */
export default function M11CRuntimeQuestionNotice({ questions }: M11CRuntimeQuestionNoticeProps) {
  if (questions.length === 0) return null;

  return (
    <div className="ar-runtime-question-stack" aria-live="polite">
      {questions.map((interaction) => (
        <WorkspaceOperationalPanel
          key={interaction.interactionId}
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
                  {question.options.map((option) => (
                    <li key={option.label}>
                      <span className="ar-runtime-question__option-label">{option.label}</span>
                      {option.description && <span className="ar-runtime-question__option-description">{option.description}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="ar-runtime-question__readonly">Response controls will be available in a governed interaction surface.</p>
        </WorkspaceOperationalPanel>
      ))}
    </div>
  );
}
