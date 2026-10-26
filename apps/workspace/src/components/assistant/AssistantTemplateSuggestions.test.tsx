/**
 * "Start from a template" — prefill is always available; run is gated.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantTemplateSuggestions } from './AssistantTemplateSuggestions';
import type { AssistantSuggestion } from './assistantSuggestionResolver';

afterEach(() => {
  cleanup();
});

const SUGGESTIONS: AssistantSuggestion[] = [
  {
    id: 'tpl-feature-delivery',
    label: 'Feature Delivery',
    description: 'Plan, build, verify, and review a scoped feature.',
    prompt: 'Set up an orchestrated project from the "Feature Delivery" template.',
    category: 'template',
    action: { type: 'create-orchestration-project', templateId: 'feature-delivery', mode: 'prefill' },
  },
];

function renderSection(overrides: Partial<Parameters<typeof AssistantTemplateSuggestions>[0]> = {}) {
  const onPrefill = vi.fn();
  const onRun = vi.fn();
  render(
    <AssistantTemplateSuggestions
      suggestions={SUGGESTIONS}
      canRun={false}
      runningTemplateId={null}
      error={null}
      onPrefill={onPrefill}
      onRun={onRun}
      {...overrides}
    />,
  );
  return { onPrefill, onRun };
}

describe('AssistantTemplateSuggestions', () => {
  it('renders nothing without suggestions', () => {
    const { container } = render(
      <AssistantTemplateSuggestions
        suggestions={[]}
        canRun
        runningTemplateId={null}
        error={null}
        onPrefill={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('prefills on click and never runs without authorization', () => {
    const { onPrefill, onRun } = renderSection();
    fireEvent.click(screen.getByTestId('assistant-template-feature-delivery'));
    expect(onPrefill).toHaveBeenCalledWith('feature-delivery');
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.queryByTestId('assistant-template-run-feature-delivery')).not.toBeInTheDocument();
  });

  it('offers an explicit run affordance when authorized', () => {
    const { onRun } = renderSection({ canRun: true });
    fireEvent.click(screen.getByTestId('assistant-template-run-feature-delivery'));
    expect(onRun).toHaveBeenCalledWith('feature-delivery');
  });

  it('reflects in-flight state and surfaces errors', () => {
    renderSection({ canRun: true, runningTemplateId: 'feature-delivery', error: 'Authentication is required.' });
    expect(screen.getByTestId('assistant-template-run-feature-delivery')).toHaveTextContent('Starting…');
    expect(screen.getByTestId('assistant-template-run-feature-delivery')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication is required.');
  });
});
