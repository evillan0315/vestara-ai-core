/**
 * AR-REC-R3 completion/hardening — focused interaction UI suite.
 *
 * Covers the smallest useful ownership boundaries:
 *   - InteractionCard / DecisionGroup / DecisionOption / DecisionState /
 *     InteractionAsyncFeedback (pure presentation, domain-neutral)
 *   - M11CStreamItem interaction branch (discriminated rendering +
 *     submit/retry wiring through the canonical response path)
 *   - pairRespondedChoices (hook-level presented/responded pairing)
 *
 * Invariants under test:
 *   - Only canonical StructuredInteraction.choices render as options.
 *   - Choice submission emits the opaque ChoiceId; the UI never invents one.
 *   - Retry resubmits the same interactionId + choiceId via submitResponse.
 *   - Ordinary Activity records never render interaction UI.
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { M11CStreamItemComponent } from '../../pages/activity/M11CStreamItem';
import type { M11CStreamItem, SubmissionState } from '../../hooks/useM11CActivityRoom';
import { pairRespondedChoices } from '../../hooks/useM11CActivityRoom';
import { DecisionGroup } from './DecisionGroup';
import { InteractionCard } from './InteractionCard';

// Markdown rendering is not under R3 test — stub the content surface so the
// suite stays focused on choice/submission behavior, not markdown output.
vi.mock('../chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <span data-testid="interaction-md">{content}</span>,
}));

// ─── Fixtures ──────────────────────────────────────────────────

const INTERACTION_ID = 'int-r3-001' as InteractionId;
const CHOICE_APPROVE = 'approve' as ChoiceId;
const CHOICE_REJECT = 'reject' as ChoiceId;
const CHOICE_ESCALATE = 'escalate' as ChoiceId;

function canonicalInteraction(): StructuredInteraction {
  return {
    interactionId: INTERACTION_ID,
    presentingParticipantId: 'agent-developer',
    presentingParticipantName: 'Developer',
    createdAt: new Date('2026-09-20T10:00:00.000Z').toISOString(),
    content: 'Deploy the preview to staging?',
    choices: [
      { choiceId: CHOICE_APPROVE, label: 'Approve', description: 'Proceed with the deploy' },
      { choiceId: CHOICE_REJECT, label: 'Reject' },
      { choiceId: CHOICE_ESCALATE, label: 'Escalate', description: 'Ask a human lead' },
    ],
  };
}

function canonicalResponse(): InteractionResponse {
  return {
    responseId: 'resp-r3-001' as InteractionResponse['responseId'],
    interactionId: INTERACTION_ID,
    selectedChoiceId: CHOICE_APPROVE,
    respondingParticipantId: 'local-operator',
    respondingParticipantName: 'Operator',
    respondedAt: new Date('2026-09-20T10:01:00.000Z').toISOString(),
  };
}

function presentedItem(): M11CStreamItem {
  const interaction = canonicalInteraction();
  return {
    id: 'stream-r3-presented',
    sequence: 41,
    timestamp: interaction.createdAt,
    kind: 'interaction',
    importance: 'primary',
    actor: { type: 'system', id: 'agent-developer', displayName: 'Developer' },
    content: interaction.content,
    fresh: false,
    interaction: {
      interactionId: interaction.interactionId,
      lifecycle: 'presented',
      choices: interaction.choices.map((c) => ({
        choiceId: c.choiceId,
        label: c.label,
        ...(c.description ? { description: c.description } : {}),
      })),
    },
  };
}

function respondedItem(withChoices: boolean): M11CStreamItem {
  const base = presentedItem();
  return {
    ...base,
    id: 'stream-r3-responded',
    sequence: 42,
    importance: 'secondary',
    actor: { type: 'human', id: 'local-operator', displayName: 'Operator' },
    interaction: {
      interactionId: INTERACTION_ID,
      lifecycle: 'responded',
      ...(withChoices ? { choices: base.interaction?.choices } : {}),
      selectedChoiceId: CHOICE_APPROVE,
      respondingParticipantId: 'local-operator',
      respondingParticipantName: 'Operator',
    },
  };
}

function ordinaryItem(): M11CStreamItem {
  return {
    id: 'stream-r3-ordinary',
    sequence: 43,
    timestamp: new Date('2026-09-20T10:02:00.000Z').toISOString(),
    kind: 'activity',
    importance: 'secondary',
    actor: { type: 'agent', id: 'agent-developer', displayName: 'Developer' },
    content: 'Developer completed task T-7',
    fresh: false,
  };
}

// ─── Suite ─────────────────────────────────────────────────────

describe('AR-REC-R3 interaction UI', () => {
  it('renders presented content and exactly the canonical choices', () => {
    const onSelect = vi.fn();
    render(<InteractionCard interaction={canonicalInteraction()} onSelect={onSelect} />);

    expect(screen.getByTestId('interaction-md')).toHaveTextContent('Deploy the preview to staging?');
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Reject/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Escalate/ })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    // Presented, unresolved: no responded state chip.
    expect(screen.queryByText('Responded')).not.toBeInTheDocument();
  });

  it('submits the correct interactionId + choiceId when a choice is selected', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    render(<M11CStreamItemComponent item={presentedItem()} onSubmitResponse={onSubmitResponse} />);

    fireEvent.click(screen.getByRole('radio', { name: /Reject/ }));

    expect(onSubmitResponse).toHaveBeenCalledTimes(1);
    expect(onSubmitResponse).toHaveBeenCalledWith(INTERACTION_ID, CHOICE_REJECT);
  });

  it('prevents duplicate submission while a response is pending', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    const submission: SubmissionState = {
      status: 'submitting',
      interactionId: INTERACTION_ID,
      choiceId: CHOICE_APPROVE,
    };
    render(
      <M11CStreamItemComponent item={presentedItem()} submission={submission} onSubmitResponse={onSubmitResponse} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Approve/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Reject/ }));

    expect(onSubmitResponse).not.toHaveBeenCalled();
    for (const option of screen.getAllByRole('radio')) {
      expect(option).toBeDisabled();
    }
    expect(screen.getByText('Submitting…')).toBeInTheDocument();
  });

  it('renders responded/accepted state with the selected canonical label', () => {
    const onSelect = vi.fn();
    render(
      <InteractionCard interaction={canonicalInteraction()} response={canonicalResponse()} onSelect={onSelect} resolved />,
    );

    expect(screen.getByText('Responded')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    // Resolved cards offer no interactive options.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('renders a paired responded stream record as resolved with the selected label', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    render(<M11CStreamItemComponent item={respondedItem(true)} onSubmitResponse={onSubmitResponse} />);

    expect(screen.getByText('Responded')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(onSubmitResponse).not.toHaveBeenCalled();
  });

  it('degrades honestly to chip-only state when the presented sibling is absent', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    render(<M11CStreamItemComponent item={respondedItem(false)} onSubmitResponse={onSubmitResponse} />);

    // Lifecycle chip survives; no label is synthesized from message text.
    expect(screen.getByText('Responded')).toBeInTheDocument();
    expect(screen.queryByText('Selected:')).not.toBeInTheDocument();
  });

  it('exposes explicit retry of the same choiceId after a retryable failure', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    const submission: SubmissionState = {
      status: 'failure',
      interactionId: INTERACTION_ID,
      choiceId: CHOICE_ESCALATE,
      error: 'Network error — please try again',
      retryable: true,
    };
    render(
      <M11CStreamItemComponent item={presentedItem()} submission={submission} onSubmitResponse={onSubmitResponse} />,
    );

    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();
    fireEvent.click(retry);

    expect(onSubmitResponse).toHaveBeenCalledTimes(1);
    expect(onSubmitResponse).toHaveBeenCalledWith(INTERACTION_ID, CHOICE_ESCALATE);
  });

  it('offers no retry affordance for non-retryable failures', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    const submission: SubmissionState = {
      status: 'failure',
      interactionId: INTERACTION_ID,
      choiceId: CHOICE_APPROVE,
      error: 'A response has already been recorded',
      retryable: false,
    };
    render(
      <M11CStreamItemComponent item={presentedItem()} submission={submission} onSubmitResponse={onSubmitResponse} />,
    );

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(onSubmitResponse).not.toHaveBeenCalled();
  });

  it('cannot produce a forged/non-contract choice through the UI', () => {
    const seen = new Set<string>();
    const onSelect = vi.fn((choiceId: ChoiceId) => {
      seen.add(choiceId);
    });
    render(<InteractionCard interaction={canonicalInteraction()} onSelect={onSelect} />);

    for (const option of screen.getAllByRole('radio')) {
      fireEvent.click(option);
    }

    expect(onSelect).toHaveBeenCalledTimes(3);
    expect([...seen].sort()).toEqual([CHOICE_APPROVE, CHOICE_ESCALATE, CHOICE_REJECT].sort());
  });

  it('leaves ordinary Activity records on the existing renderer', () => {
    const onSubmitResponse = vi.fn(async (_interactionId: string, _choiceId: string) => {});
    render(<M11CStreamItemComponent item={ordinaryItem()} onSubmitResponse={onSubmitResponse} />);

    expect(screen.getByText('Developer completed task T-7')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(onSubmitResponse).not.toHaveBeenCalled();
  });

  it('supports keyboard navigation, activation, and disabled semantics', () => {
    const onSelect = vi.fn();
    const interaction = canonicalInteraction();
    const { unmount } = render(<DecisionGroup choices={interaction.choices} onSelect={onSelect} />);

    const group = screen.getByRole('radiogroup');
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);

    options[0].focus();
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(options[2], { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(CHOICE_ESCALATE);
    expect(options[2]).toHaveAttribute('aria-checked', 'true');
    unmount();

    render(<DecisionGroup choices={interaction.choices} onSelect={onSelect} disabled />);
    for (const option of screen.getAllByRole('radio')) {
      expect(option).toBeDisabled();
      expect(option).toHaveAttribute('tabindex', '-1');
    }
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
  });

  it('pairs responded records with presented choices without inventing content', () => {
    const presented = presentedItem();
    const responded = respondedItem(false);
    const ordinary = ordinaryItem();

    const paired = pairRespondedChoices([responded, ordinary, presented]);

    const pairedResponded = paired.find((item) => item.id === responded.id);
    expect(pairedResponded?.interaction?.choices?.map((c) => c.choiceId)).toEqual(
      presented.interaction?.choices?.map((c) => c.choiceId),
    );
    // Window order and unrelated records are preserved untouched.
    expect(paired.map((item) => item.id)).toEqual([responded.id, ordinary.id, presented.id]);
    expect(paired.find((item) => item.id === ordinary.id)).toBe(ordinary);
    expect(paired.find((item) => item.id === presented.id)).toBe(presented);
  });

  it('leaves responded records chip-only when no presented sibling is in the window', () => {
    const paired = pairRespondedChoices([respondedItem(false), ordinaryItem()]);
    expect(paired.find((item) => item.id === 'stream-r3-responded')?.interaction?.choices).toBeUndefined();
  });
});
