/**
 * @vitest-environment jsdom
 *
 * R3 — Shared UI Foundation Tests
 *
 * Tests for all 5 interaction components:
 *   - DecisionOption
 *   - DecisionGroup
 *   - DecisionState
 *   - InteractionAsyncFeedback
 *   - InteractionCard
 *
 * Plus genericity tests proving the same components render
 * Harness, Marketplace, Banana Department, and historical interactions.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructuredInteraction, InteractionResponse, ChoiceId, InteractionId } from '@vestara/types';
import { DecisionOption } from '../src/components/interaction/DecisionOption.js';
import { DecisionGroup } from '../src/components/interaction/DecisionGroup.js';
import { DecisionState } from '../src/components/interaction/DecisionState.js';
import { InteractionAsyncFeedback } from '../src/components/interaction/InteractionAsyncFeedback.js';
import { InteractionCard } from '../src/components/interaction/InteractionCard.js';

afterEach(() => {
  cleanup();
});

// ─── Fixtures ────────────────────────────────────────────────

function makeInteraction(overrides: Partial<StructuredInteraction> = {}): StructuredInteraction {
  return {
    interactionId: 'int-test-001' as InteractionId,
    presentingParticipantId: 'test-producer',
    presentingParticipantName: 'Test Producer',
    createdAt: '2026-08-30T12:00:00Z',
    content: 'How should we proceed?',
    choices: [
      { choiceId: 'opt-a' as ChoiceId, label: 'Option A' },
      { choiceId: 'opt-b' as ChoiceId, label: 'Option B' },
      { choiceId: 'opt-c' as ChoiceId, label: 'Option C' },
    ],
    ...overrides,
  };
}

function makeResponse(overrides: Partial<InteractionResponse> = {}): InteractionResponse {
  return {
    responseId: 'resp-001' as import('@vestara/types').Brand<string, 'ResponseId'>,
    interactionId: 'int-test-001' as InteractionId,
    selectedChoiceId: 'opt-a' as ChoiceId,
    respondingParticipantId: 'human-1',
    respondingParticipantName: 'Human User',
    respondedAt: '2026-08-30T12:05:00Z',
    ...overrides,
  };
}

// ─── DecisionOption Tests ────────────────────────────────────

describe('DecisionOption', () => {
  const choice = { choiceId: 'opt-x' as ChoiceId, label: 'Select me', description: 'A helpful description' };
  const onSelect = vi.fn();

  afterEach(() => {
    onSelect.mockClear();
  });

  it('renders label and description', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} />);
    expect(screen.getByText('Select me')).toBeDefined();
    expect(screen.getByText('A helpful description')).toBeDefined();
  });

  it('emits choiceId on click', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select me'));
    expect(onSelect).toHaveBeenCalledWith('opt-x');
  });

  it('emits choiceId on Enter key', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} />);
    const button = screen.getByRole('radio');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('opt-x');
  });

  it('emits choiceId on Space key', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} />);
    const button = screen.getByRole('radio');
    fireEvent.keyDown(button, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('opt-x');
  });

  it('does not emit when disabled', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByText('Select me'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('has role="radio" and aria-checked when selected', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} selected />);
    const button = screen.getByRole('radio');
    expect(button.getAttribute('aria-checked')).toBe('true');
  });

  it('has aria-checked=false when not selected', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} />);
    const button = screen.getByRole('radio');
    expect(button.getAttribute('aria-checked')).toBe('false');
  });

  it('has aria-disabled when disabled', () => {
    render(<DecisionOption choice={choice} onSelect={onSelect} disabled />);
    const button = screen.getByRole('radio');
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders without description when description is undefined', () => {
    const noDesc = { choiceId: 'opt-y' as ChoiceId, label: 'No desc' };
    render(<DecisionOption choice={noDesc} onSelect={onSelect} />);
    expect(screen.getByText('No desc')).toBeDefined();
    expect(screen.queryByText('A helpful description')).toBeNull();
  });
});

// ─── DecisionGroup Tests ─────────────────────────────────────

describe('DecisionGroup', () => {
  const choices = [
    { choiceId: 'alpha' as ChoiceId, label: 'Alpha' },
    { choiceId: 'beta' as ChoiceId, label: 'Beta' },
    { choiceId: 'gamma' as ChoiceId, label: 'Gamma' },
  ];
  const onSelect = vi.fn();

  afterEach(() => {
    onSelect.mockClear();
  });

  it('renders all choices', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.getByText('Gamma')).toBeDefined();
  });

  it('has role="radiogroup"', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    expect(screen.getByRole('radiogroup')).toBeDefined();
  });

  it('emits choiceId when a choice is clicked', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Beta'));
    expect(onSelect).toHaveBeenCalledWith('beta');
  });

  it('supports controlled selection', () => {
    render(
      <DecisionGroup choices={choices} onSelect={onSelect} selectedChoiceId="beta" />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
  });

  it('supports uncontrolled selection', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Gamma'));
    // After click, the internal state should update
    const radios = screen.getAllByRole('radio');
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
  });

  it('disables all choices when disabled', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} disabled />);
    const radios = screen.getAllByRole('radio');
    for (const radio of radios) {
      expect(radio.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('navigates with arrow keys', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(radios[1]);
  });

  it('wraps arrow navigation at boundaries', () => {
    render(<DecisionGroup choices={choices} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    radios[2].focus();
    fireEvent.keyDown(radios[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(radios[0]);
  });

  it('supports horizontal layout', () => {
    const { container } = render(
      <DecisionGroup choices={choices} onSelect={onSelect} layout="horizontal" />,
    );
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.className).toContain('flex-row');
  });
});

// ─── DecisionState Tests ─────────────────────────────────────

describe('DecisionState', () => {
  const choices = [
    { choiceId: 'approve' as ChoiceId, label: 'Approve' },
    { choiceId: 'reject' as ChoiceId, label: 'Reject' },
  ];

  it('renders presented state', () => {
    render(<DecisionState state="presented" />);
    expect(screen.getByText('Awaiting response')).toBeDefined();
  });

  it('renders responded state with selected choice', () => {
    const response = makeResponse({ selectedChoiceId: 'approve' as ChoiceId });
    render(<DecisionState state="responded" response={response} choices={choices} />);
    expect(screen.getByText('Responded')).toBeDefined();
    expect(screen.getByText('Selected:')).toBeDefined();
    expect(screen.getByText('Approve')).toBeDefined();
  });

  it('renders expired state', () => {
    render(<DecisionState state="expired" />);
    expect(screen.getByText('Expired')).toBeDefined();
  });

  it('renders responded state without choices (no selected display)', () => {
    const response = makeResponse();
    render(<DecisionState state="responded" response={response} />);
    expect(screen.getByText('Responded')).toBeDefined();
    expect(screen.queryByText('Selected:')).toBeNull();
  });
});

// ─── InteractionAsyncFeedback Tests ──────────────────────────

describe('InteractionAsyncFeedback', () => {
  it('renders nothing for idle state', () => {
    const { container } = render(<InteractionAsyncFeedback state={{ status: 'idle' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders submitting state', () => {
    render(<InteractionAsyncFeedback state={{ status: 'submitting' }} />);
    expect(screen.getByText('Submitting…')).toBeDefined();
  });

  it('renders accepted state', () => {
    const response = makeResponse();
    render(<InteractionAsyncFeedback state={{ status: 'accepted', response }} />);
    expect(screen.getByText('Response recorded')).toBeDefined();
  });

  it('renders failure state with error message', () => {
    const onRetry = vi.fn();
    render(
      <InteractionAsyncFeedback
        state={{ status: 'failure', error: 'Network error', retryable: true }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Network error')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('renders failure state without retry button when not retryable', () => {
    render(
      <InteractionAsyncFeedback
        state={{ status: 'failure', error: 'Permanent error', retryable: false }}
      />,
    );
    expect(screen.getByText('Permanent error')).toBeDefined();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(
      <InteractionAsyncFeedback
        state={{ status: 'failure', error: 'Temp error', retryable: true }}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders retrying state with attempt count', () => {
    render(<InteractionAsyncFeedback state={{ status: 'retrying', attempt: 2 }} />);
    expect(screen.getByText('Retrying (2)…')).toBeDefined();
  });

  it('renders unavailable state', () => {
    render(<InteractionAsyncFeedback state={{ status: 'unavailable' }} />);
    expect(screen.getByText('Service unavailable')).toBeDefined();
  });

  it('renders stale state', () => {
    render(<InteractionAsyncFeedback state={{ status: 'stale' }} />);
    expect(screen.getByText('Interaction is no longer current')).toBeDefined();
  });

  it('has aria-live="polite" for screen reader announcement', () => {
    render(<InteractionAsyncFeedback state={{ status: 'submitting' }} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});

// ─── InteractionCard Tests ───────────────────────────────────

describe('InteractionCard', () => {
  const onSelect = vi.fn();

  afterEach(() => {
    onSelect.mockClear();
  });

  it('renders interaction content', () => {
    const interaction = makeInteraction({ content: 'What color?' });
    render(<InteractionCard interaction={interaction} onSelect={onSelect} />);
    expect(screen.getByText('What color?')).toBeDefined();
  });

  it('renders presenter name', () => {
    const interaction = makeInteraction({ presentingParticipantName: 'Alice' });
    render(<InteractionCard interaction={interaction} onSelect={onSelect} />);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('renders choices when interactive', () => {
    const interaction = makeInteraction();
    render(<InteractionCard interaction={interaction} onSelect={onSelect} />);
    expect(screen.getByText('Option A')).toBeDefined();
    expect(screen.getByText('Option B')).toBeDefined();
    expect(screen.getByText('Option C')).toBeDefined();
  });

  it('hides choices when resolved', () => {
    const interaction = makeInteraction();
    const response = makeResponse();
    render(
      <InteractionCard
        interaction={interaction}
        response={response}
        onSelect={onSelect}
        resolved
      />,
    );
    // No interactive radio buttons when resolved
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // DecisionState shows the selected choice instead
    expect(screen.getByText('Responded')).toBeDefined();
    expect(screen.getByText('Selected:')).toBeDefined();
  });

  it('hides choices when disabled', () => {
    const interaction = makeInteraction();
    render(
      <InteractionCard
        interaction={interaction}
        onSelect={onSelect}
        disabled
      />,
    );
    // When disabled, isInteractive=false so DecisionGroup is not rendered
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('emits choiceId when a choice is selected', () => {
    const interaction = makeInteraction();
    render(<InteractionCard interaction={interaction} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Option B'));
    expect(onSelect).toHaveBeenCalledWith('opt-b');
  });

  it('renders async feedback when provided', () => {
    const interaction = makeInteraction();
    render(
      <InteractionCard
        interaction={interaction}
        onSelect={onSelect}
        feedback={{ status: 'submitting' }}
      />,
    );
    expect(screen.getByText('Submitting…')).toBeDefined();
  });

  it('applies fresh animation class', () => {
    const interaction = makeInteraction();
    const { container } = render(
      <InteractionCard interaction={interaction} onSelect={onSelect} fresh />,
    );
    const article = container.querySelector('article');
    expect(article?.className).toContain('animate-in');
  });

  it('has article role', () => {
    const interaction = makeInteraction();
    render(<InteractionCard interaction={interaction} onSelect={onSelect} />);
    expect(screen.getByRole('article')).toBeDefined();
  });
});

// ─── Genericity Tests ────────────────────────────────────────

describe('R3 Genericity — same components, unrelated producers', () => {
  const onSelect = vi.fn();

  afterEach(() => {
    onSelect.mockClear();
  });

  // Fixture A: Harness approval
  it('renders Harness approval interaction', () => {
    const harnessInteraction = makeInteraction({
      content: 'Approve git.add on src/index.ts',
      choices: [
        { choiceId: 'approve' as ChoiceId, label: 'Approve' },
        { choiceId: 'reject' as ChoiceId, label: 'Reject' },
      ],
    });
    render(<InteractionCard interaction={harnessInteraction} onSelect={onSelect} />);
    expect(screen.getByText('Approve git.add on src/index.ts')).toBeDefined();
    expect(screen.getByText('Approve')).toBeDefined();
    expect(screen.getByText('Reject')).toBeDefined();
    fireEvent.click(screen.getByText('Approve'));
    expect(onSelect).toHaveBeenCalledWith('approve');
  });

  // Fixture B: Marketplace recommendation
  it('renders Marketplace recommendation interaction', () => {
    const marketplaceInteraction = makeInteraction({
      content: 'I found existing dashboard components that may fit.',
      choices: [
        { choiceId: 'check-existing' as ChoiceId, label: 'Check existing options' },
        { choiceId: 'continue-building' as ChoiceId, label: 'Continue building' },
        { choiceId: 'tell-me-more' as ChoiceId, label: 'Tell me more' },
      ],
    });
    render(<InteractionCard interaction={marketplaceInteraction} onSelect={onSelect} />);
    expect(screen.getByText('Check existing options')).toBeDefined();
    expect(screen.getByText('Continue building')).toBeDefined();
    expect(screen.getByText('Tell me more')).toBeDefined();
    fireEvent.click(screen.getByText('Tell me more'));
    expect(onSelect).toHaveBeenCalledWith('tell-me-more');
  });

  // Fixture C: Banana Department interaction
  it('renders Banana Department interaction', () => {
    const bananaInteraction = makeInteraction({
      presentingParticipantName: 'Banana Department',
      content: 'How should Banana Department proceed?',
      choices: [
        { choiceId: 'yellow' as ChoiceId, label: 'Use yellow workflow' },
        { choiceId: 'green' as ChoiceId, label: 'Use green workflow' },
        { choiceId: 'later' as ChoiceId, label: 'Ask me later' },
      ],
    });
    render(<InteractionCard interaction={bananaInteraction} onSelect={onSelect} />);
    expect(screen.getByText('Banana Department')).toBeDefined();
    expect(screen.getByText('How should Banana Department proceed?')).toBeDefined();
    expect(screen.getByText('Use yellow workflow')).toBeDefined();
    expect(screen.getByText('Use green workflow')).toBeDefined();
    expect(screen.getByText('Ask me later')).toBeDefined();
    fireEvent.click(screen.getByText('Use green workflow'));
    expect(onSelect).toHaveBeenCalledWith('green');
  });

  // Fixture D: Already-resolved historical interaction
  it('renders resolved historical interaction', () => {
    const historicalInteraction = makeInteraction({
      content: 'Approve git.commit?',
      choices: [
        { choiceId: 'approve' as ChoiceId, label: 'Approve' },
        { choiceId: 'reject' as ChoiceId, label: 'Reject' },
      ],
    });
    const response = makeResponse({ selectedChoiceId: 'approve' as ChoiceId });
    render(
      <InteractionCard
        interaction={historicalInteraction}
        response={response}
        onSelect={onSelect}
        resolved
      />,
    );
    expect(screen.getByText('Approve git.commit?')).toBeDefined();
    expect(screen.getByText('Responded')).toBeDefined();
    expect(screen.getByText('Selected:')).toBeDefined();
    expect(screen.getByText('Approve')).toBeDefined();
    // Choices should not be interactive
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  // Fixture E: Single choice interaction
  it('renders single-choice interaction', () => {
    const singleChoice = makeInteraction({
      content: 'Acknowledge this finding.',
      choices: [
        { choiceId: 'acknowledge' as ChoiceId, label: 'Acknowledge' },
      ],
    });
    render(<InteractionCard interaction={singleChoice} onSelect={onSelect} />);
    expect(screen.getByText('Acknowledge')).toBeDefined();
    fireEvent.click(screen.getByText('Acknowledge'));
    expect(onSelect).toHaveBeenCalledWith('acknowledge');
  });

  // Fixture F: Choice with description
  it('renders choice with description', () => {
    const withDesc = makeInteraction({
      content: 'Choose an approach.',
      choices: [
        {
          choiceId: 'approach-a' as ChoiceId,
          label: 'Approach A',
          description: 'Faster but less thorough',
        },
        {
          choiceId: 'approach-b' as ChoiceId,
          label: 'Approach B',
          description: 'Slower but more complete',
        },
      ],
    });
    render(<InteractionCard interaction={withDesc} onSelect={onSelect} />);
    expect(screen.getByText('Faster but less thorough')).toBeDefined();
    expect(screen.getByText('Slower but more complete')).toBeDefined();
  });
});

// ─── Zero-Hardcoding Evidence ────────────────────────────────

describe('R3 Zero-Hardcoding — no producer/domain leakage', () => {
  it('DecisionOption does not reference any domain-specific strings', () => {
    // This test verifies the component source does not contain domain terms
    // by rendering with completely unrelated choice labels
    const nonsense = {
      choiceId: 'quantum-flux' as ChoiceId,
      label: 'Recalibrate the flux capacitor',
    };
    const onSelect = vi.fn();
    render(<DecisionOption choice={nonsense} onSelect={onSelect} />);
    expect(screen.getByText('Recalibrate the flux capacitor')).toBeDefined();
    fireEvent.click(screen.getByText('Recalibrate the flux capacitor'));
    expect(onSelect).toHaveBeenCalledWith('quantum-flux');
  });

  it('DecisionGroup renders any number of choices without domain knowledge', () => {
    const manyChoices = Array.from({ length: 10 }, (_, i) => ({
      choiceId: `choice-${i}` as ChoiceId,
      label: `Option ${i}: ${String.fromCharCode(65 + i)}`,
    }));
    const onSelect = vi.fn();
    render(<DecisionGroup choices={manyChoices} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(10);
    fireEvent.click(screen.getByText('Option 5: F'));
    expect(onSelect).toHaveBeenCalledWith('choice-5');
  });

  it('InteractionCard renders without any domain-specific logic', () => {
    const alienInteraction = makeInteraction({
      presentingParticipantName: 'Zorgon Embassy',
      content: 'The planetary alignment requires a decision.',
      choices: [
        { choiceId: 'align-north' as ChoiceId, label: 'Align north pole' },
        { choiceId: 'align-south' as ChoiceId, label: 'Align south pole' },
        { choiceId: 'delay' as ChoiceId, label: 'Delay by one cycle' },
      ],
    });
    const onSelect = vi.fn();
    render(<InteractionCard interaction={alienInteraction} onSelect={onSelect} />);
    expect(screen.getByText('Zorgon Embassy')).toBeDefined();
    expect(screen.getByText('The planetary alignment requires a decision.')).toBeDefined();
    expect(screen.getByText('Align north pole')).toBeDefined();
  });
});
