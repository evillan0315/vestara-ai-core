/**
 * Suggested next steps — collapsible multi-select with an explicit, reviewed confirm.
 *
 * Replaces the previous one-click chips. Each suggestion is a checkbox, and
 * nothing is sent until the user ticks steps, presses the submit control, and
 * confirms the selection in the dialog. Sending is therefore always an explicit
 * action, and the confirmation shows exactly which steps will be sent.
 *
 * One submit produces exactly ONE turn: a single step is sent verbatim, several
 * steps are sent as an ordered list. The text is composed only from the parsed
 * suggestion text — no instruction is invented.
 *
 * Layout — scoped to THIS message, never the conversation thread:
 *   ┌ header (disclosure trigger) ────────────────┐  always visible
 *   ├ bounded scroll region ──────────────────────┤  max-h: --vestara-sizing-scroll-max-height
 *   │   step list  (scrolls)                      │
 *   │   ─────────────────────────────             │
 *   │                       [send n]  ← action bar│  pinned to the bottom of the region
 *   └─────────────────────────────────────────────┘
 *
 * The action bar is the last flex child of the bounded region rather than a
 * `position: sticky` overlay: a sticky bar would float over the final row and
 * would need a background matched to the message surface. As a flow sibling it
 * stays visible for the whole length of this message's region — including at
 * the end of the message — without overlaying anything. It deliberately does
 * NOT stick to the thread viewport, so it travels with its own message.
 *
 * The scrollbar is the app-wide 4px accent scrollbar (src/styles/index.css),
 * not a local override.
 */

import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { useCallback, useId, useMemo, useState } from 'react';
import { VestaraModal } from '../ui/VestaraModal';
import { SectionLabel } from './AssistantSectionLabel';

/**
 * Compose the follow-up turn from the selected steps. A single step is sent
 * verbatim so it reads exactly as the assistant proposed it; multiple steps
 * become an ordered list so their sequence survives the round trip.
 */
export function composeNextSteps(steps: readonly string[]): string {
  if (steps.length === 0) return '';
  if (steps.length === 1) return steps[0];
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}

export interface AssistantSuggestedStepsProps {
  readonly suggestions: readonly string[];
  /** Sends the composed follow-up text as a single turn. */
  readonly onSend: (text: string) => void;
}

export function AssistantSuggestedSteps({ suggestions, onSend }: AssistantSuggestedStepsProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [confirming, setConfirming] = useState(false);
  // Open by default: the block was always visible before, so collapsing is the
  // opt-in action rather than a new thing to discover.
  const [expanded, setExpanded] = useState(true);

  const uid = useId().replace(/:/g, '');
  const triggerId = `suggested-steps-${uid}-trigger`;
  const listId = `suggested-steps-${uid}-list`;

  // Keep the parser's order rather than the order the steps were ticked.
  const selectedSteps = useMemo(() => suggestions.filter((step) => selected.has(step)), [suggestions, selected]);
  const count = selectedSteps.length;

  const toggle = useCallback((step: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    const steps = selectedSteps;
    if (steps.length === 0) return;
    setConfirming(false);
    setSelected(new Set<string>());
    onSend(composeNextSteps(steps));
  }, [selectedSteps, onSend]);

  return (
    <div className="min-w-0" data-testid="response-suggestions">
      <button
        type="button"
        id={triggerId}
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={`${expanded ? 'Hide' : 'Show'} suggested next steps`}
        data-testid="response-suggestion-toggle"
        className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-(--vestara-accent)/60"
      >
        <span aria-hidden="true" className="shrink-0 text-(--vestara-font-size-caption) text-(--vestara-text-disabled)">
          {expanded ? '▾' : '▸'}
        </span>
        <SectionLabel>Suggested next steps</SectionLabel>
      </button>

      {/* Bounded to this message: the list scrolls inside its own region and the
          action bar rides its bottom, so it is still there at the end of the
          message. Rendered while collapsed too, so a selection stays sendable. */}
      {(expanded || count > 0) && (
        <div
          data-testid="response-suggestion-region"
          className="mt-1 flex max-h-[var(--vestara-sizing-scroll-max-height)] min-w-0 flex-col"
        >
          {expanded && (
            <ul
              id={listId}
              aria-labelledby={triggerId}
              data-testid="response-suggestion-list"
              className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto pr-0.5"
            >
              {suggestions.map((step) => {
                const isSelected = selected.has(step);
                return (
                  <li key={step} className="min-w-0">
                    <label
                      className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-[var(--vestara-radius-md)] border px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)] transition-colors ${
                        isSelected
                          ? 'border-(--vestara-accent-border) bg-(--vestara-accent-bg)'
                          : 'border-(--vestara-border-subtle) bg-(--vestara-surface-interactive) hover:border-(--vestara-border-default)'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(step)}
                        data-testid="response-suggestion-checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-(--vestara-accent)"
                      />
                      <span className="min-w-0 flex-1 text-(--vestara-font-size-label) leading-snug text-(--vestara-text-primary)">
                        {step}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Hidden rather than disabled at zero selection: no dead control, and
              the affordance appears exactly when there is something to send. */}
          {count > 0 && (
            <div
              data-testid="response-suggestion-submitbar"
              className="mt-1 flex shrink-0 justify-end border-t border-(--vestara-border-subtle) pt-1.5"
            >
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Review and send ${count} selected next ${count === 1 ? 'step' : 'steps'}`}
                title="Send selected steps"
                data-testid="response-suggestion-submit"
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-0.5 text-(--vestara-accent-text) transition-all hover:border-(--vestara-accent) hover:brightness-110 active:scale-95"
              >
                <SendRoundedIcon sx={{ fontSize: 13 }} />
                <span
                  data-testid="response-suggestion-count"
                  className="text-(--vestara-font-size-caption) font-semibold tabular-nums"
                >
                  {count}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {confirming && count > 0 && (
        <VestaraModal onClose={() => setConfirming(false)} ariaLabel="Confirm selected next steps" className="max-w-md">
          <div className="space-y-3 px-5 py-4">
            <div>
              <h2 className="text-(--vestara-font-size-body) font-semibold text-(--vestara-text-primary)">
                Send selected next steps?
              </h2>
              <p className="mt-0.5 text-(--vestara-font-size-caption) leading-relaxed text-(--vestara-text-muted)">
                {count === 1
                  ? 'This step will be sent as your next message.'
                  : `These ${count} steps will be sent together as one message.`}
              </p>
            </div>

            <ol
              className="max-h-[var(--vestara-sizing-scroll-dialog-max-height)] min-w-0 space-y-1 overflow-y-auto pr-0.5"
              data-testid="response-suggestion-confirm-list"
            >
              {selectedSteps.map((step, index) => (
                <li
                  key={step}
                  data-testid="response-suggestion-confirm-item"
                  className="flex min-w-0 items-start gap-2 rounded-[var(--vestara-radius-md)] border border-(--vestara-border-subtle) bg-(--vestara-surface-panel) px-[var(--vestara-spacing-2)] py-[var(--vestara-spacing-1)]"
                >
                  <span className="shrink-0 font-mono text-(--vestara-font-size-caption) font-semibold text-(--vestara-accent-text)">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-(--vestara-font-size-label) leading-snug text-(--vestara-text-primary)">
                    {step}
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                data-testid="response-suggestion-cancel"
                className="cursor-pointer rounded-[var(--vestara-radius-md)] border border-(--vestara-border-subtle) px-3 py-1.5 text-(--vestara-font-size-label) text-(--vestara-text-secondary) transition-colors hover:text-(--vestara-text-primary)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                data-testid="response-suggestion-confirm"
                className="cursor-pointer rounded-[var(--vestara-radius-md)] border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-(--vestara-font-size-label) font-medium text-(--vestara-accent-text) transition-colors hover:border-(--vestara-accent)"
              >
                Send
              </button>
            </div>
          </div>
        </VestaraModal>
      )}
    </div>
  );
}

export default AssistantSuggestedSteps;
