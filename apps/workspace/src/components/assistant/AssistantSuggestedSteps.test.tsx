/**
 * Suggested-next-steps multi-select: checkbox selection, the count-bearing
 * submit control, and the confirming dialog.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantSuggestedSteps, composeNextSteps } from './AssistantSuggestedSteps.js';

afterEach(() => {
  cleanup();
});

const STEPS = ['Start on interactive blocks', 'Wire the verifier route', 'Add a regression test for the parser'];

function renderSteps(steps: readonly string[] = STEPS) {
  const onSend = vi.fn();
  render(<AssistantSuggestedSteps suggestions={steps} onSend={onSend} />);
  return { onSend };
}

const boxes = () => screen.getAllByTestId('response-suggestion-checkbox');
const submit = () => screen.queryByTestId('response-suggestion-submit');

describe('composeNextSteps', () => {
  it('returns empty text for no steps', () => {
    expect(composeNextSteps([])).toBe('');
  });

  it('sends a single step verbatim', () => {
    expect(composeNextSteps([STEPS[0]])).toBe(STEPS[0]);
  });

  it('sends multiple steps as an ordered list', () => {
    expect(composeNextSteps([STEPS[0], STEPS[2]])).toBe(`1. ${STEPS[0]}\n2. ${STEPS[2]}`);
  });

  it('never invents text beyond the given steps', () => {
    const composed = composeNextSteps(STEPS);
    for (const line of composed.split('\n')) {
      const body = line.replace(/^\d+\.\s*/, '');
      expect(STEPS).toContain(body);
    }
  });
});

describe('AssistantSuggestedSteps selection', () => {
  it('renders one checkbox per suggestion', () => {
    renderSteps();
    expect(boxes()).toHaveLength(STEPS.length);
  });

  it('renders every suggestion unticked initially', () => {
    renderSteps();
    for (const box of boxes()) expect(box).not.toBeChecked();
  });

  it('hides the submit control when nothing is selected', () => {
    renderSteps();
    expect(submit()).toBeNull();
  });

  it('shows the submit control with a count of one after selecting a step', () => {
    renderSteps();
    fireEvent.click(boxes()[1]);

    expect(submit()).not.toBeNull();
    expect(screen.getByTestId('response-suggestion-count')).toHaveTextContent('1');
  });

  it('reflects the number of selected steps', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[2]);

    expect(screen.getByTestId('response-suggestion-count')).toHaveTextContent('2');
  });

  it('hides the submit control again when the last step is deselected', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    expect(submit()).not.toBeNull();

    fireEvent.click(boxes()[0]);
    expect(submit()).toBeNull();
  });

  it('labels the submit control with the selection count', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[1]);

    expect(screen.getByLabelText('Review and send 2 selected next steps')).toBeInTheDocument();
  });

  it('sends nothing on selection alone', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[1]);

    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('AssistantSuggestedSteps disclosure', () => {
  it('shows the list by default', () => {
    renderSteps();
    expect(screen.getByTestId('response-suggestion-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('response-suggestion-list')).toBeInTheDocument();
  });

  it('hides the list when the toggle is activated', () => {
    renderSteps();
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));

    expect(screen.getByTestId('response-suggestion-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('response-suggestion-list')).toBeNull();
    expect(screen.queryAllByTestId('response-suggestion-checkbox')).toHaveLength(0);
  });

  it('restores the list when the toggle is activated again', () => {
    renderSteps();
    const toggle = screen.getByTestId('response-suggestion-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(boxes()).toHaveLength(STEPS.length);
  });

  it('names the list from the trigger', () => {
    renderSteps();
    const toggle = screen.getByTestId('response-suggestion-toggle');
    const list = screen.getByTestId('response-suggestion-list');

    expect(list.id).toBe(toggle.getAttribute('aria-controls'));
    expect(list).toHaveAttribute('aria-labelledby', toggle.id);
  });

  it('keeps the selection when the list is collapsed', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));

    expect(boxes()[0]).toBeChecked();
  });

  it('keeps the submit control available while collapsed', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));

    // The header sits outside the scrolling region, so collapsing the list must
    // not take the send affordance with it.
    expect(screen.getByTestId('response-suggestion-submit')).toBeInTheDocument();
    expect(screen.getByTestId('response-suggestion-count')).toHaveTextContent('1');
  });

  it('can still send a selected step after collapsing the list', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[1]);
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));
    fireEvent.click(screen.getByTestId('response-suggestion-submit'));
    fireEvent.click(screen.getByTestId('response-suggestion-confirm'));

    expect(onSend).toHaveBeenCalledWith(STEPS[1]);
  });

  it('bounds the region height with a sizing token so long lists scroll instead of growing', () => {
    renderSteps();
    const region = screen.getByTestId('response-suggestion-region');

    expect(region.className).toContain('max-h-[var(--vestara-sizing-scroll-max-height)]');

    const list = screen.getByTestId('response-suggestion-list');
    expect(list.className).toContain('overflow-y-auto');
  });

  it('does not scroll the list when collapsed', () => {
    renderSteps();
    fireEvent.click(screen.getByTestId('response-suggestion-toggle'));

    expect(screen.queryByTestId('response-suggestion-list')).toBeNull();
  });
});

describe('AssistantSuggestedSteps action bar placement', () => {
  it('renders no action bar before anything is selected', () => {
    renderSteps();
    expect(screen.queryByTestId('response-suggestion-submitbar')).toBeNull();
  });

  it('places the action bar at the bottom of the message region, after the list', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);

    const region = screen.getByTestId('response-suggestion-region');
    expect(region.firstElementChild).toBe(screen.getByTestId('response-suggestion-list'));
    expect(region.lastElementChild).toBe(screen.getByTestId('response-suggestion-submitbar'));
  });

  it('keeps the action bar inside the bounded region so it lasts the whole message', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);

    const region = screen.getByTestId('response-suggestion-region');
    expect(region.contains(screen.getByTestId('response-suggestion-submit'))).toBe(true);
  });

  it('keeps the action bar in flow rather than overlaying the list', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);

    // A sticky overlay would float over the final row; the bar is a flow sibling.
    expect(screen.getByTestId('response-suggestion-submitbar').className).not.toContain('sticky');
    expect(screen.getByTestId('response-suggestion-submitbar').className).toContain('shrink-0');
  });

  it('bounds the dialog list with the dialog sizing token', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByTestId('response-suggestion-submit'));

    expect(screen.getByTestId('response-suggestion-confirm-list').className).toContain(
      'max-h-[var(--vestara-sizing-scroll-dialog-max-height)]',
    );
  });
});

describe('AssistantSuggestedSteps confirmation', () => {
  it('opens a dialog listing only the selected steps, in suggestion order', () => {
    renderSteps();
    // Tick in reverse order to prove the dialog follows the suggestion order.
    fireEvent.click(boxes()[2]);
    fireEvent.click(boxes()[0]);
    fireEvent.click(submit() as HTMLElement);

    const items = screen.getAllByTestId('response-suggestion-confirm-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(STEPS[0]);
    expect(items[1]).toHaveTextContent(STEPS[2]);
    // Scope to the dialog: the unselected step is still present in the list behind it.
    const dialog = screen.getByTestId('response-suggestion-confirm-list');
    expect(within(dialog).queryByText(STEPS[1])).toBeNull();
  });

  it('does not send while the dialog is open', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(submit() as HTMLElement);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends nothing when cancelled', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(submit() as HTMLElement);
    fireEvent.click(screen.getByTestId('response-suggestion-cancel'));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByTestId('response-suggestion-confirm')).toBeNull();
  });

  it('keeps the selection after cancelling', () => {
    renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(submit() as HTMLElement);
    fireEvent.click(screen.getByTestId('response-suggestion-cancel'));

    expect(boxes()[0]).toBeChecked();
    expect(screen.getByTestId('response-suggestion-count')).toHaveTextContent('1');
  });

  it('sends exactly one turn on confirm', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(boxes()[2]);
    fireEvent.click(submit() as HTMLElement);
    fireEvent.click(screen.getByTestId('response-suggestion-confirm'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(`1. ${STEPS[0]}\n2. ${STEPS[2]}`);
  });

  it('sends a single selected step verbatim without list numbering', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[1]);
    fireEvent.click(submit() as HTMLElement);
    fireEvent.click(screen.getByTestId('response-suggestion-confirm'));

    expect(onSend).toHaveBeenCalledWith(STEPS[1]);
  });

  it('clears the selection and closes the dialog after sending', () => {
    const { onSend } = renderSteps();
    fireEvent.click(boxes()[0]);
    fireEvent.click(submit() as HTMLElement);
    fireEvent.click(screen.getByTestId('response-suggestion-confirm'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('response-suggestion-confirm')).toBeNull();
    expect(submit()).toBeNull();
    for (const box of boxes()) expect(box).not.toBeChecked();
  });
});
