/**
 * UI-COMP-001 Phase 7E — canonical Stepper focused suite.
 *
 * Covers ordered rendering, the four presentation states, aria-current
 * semantics, optional description, empty input, optional selection, and
 * instance independence.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Stepper, type StepDefinition } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

const STEPS: readonly StepDefinition[] = [
  { id: 'request', label: 'Requested', description: 'Received into the queue', state: 'complete' },
  { id: 'build', label: 'Build', state: 'current' },
  { id: 'test', label: 'Test', state: 'upcoming' },
  { id: 'verify', label: 'Verify', state: 'error' },
];

describe('Stepper (canonical @vestara/ui)', () => {
  it('renders steps as an ordered list in array order', () => {
    render(<Stepper steps={STEPS} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Requested');
    expect(items[1]).toHaveTextContent('Build');
    expect(items[2]).toHaveTextContent('Test');
    expect(items[3]).toHaveTextContent('Verify');
  });

  it('exposes the current step with aria-current and leaves others unmarked', () => {
    render(<Stepper steps={STEPS} />);
    const items = screen.getAllByRole('listitem');

    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).not.toHaveAttribute('aria-current');
    expect(items[3]).not.toHaveAttribute('aria-current');
  });

  it('renders each presentation state distinctly', () => {
    render(<Stepper steps={STEPS} />);
    const items = screen.getAllByRole('listitem');

    expect(items[0]).toHaveTextContent('✓');
    expect(items[1]).toHaveTextContent('●');
    expect(items[2]).not.toHaveTextContent('✓');
    expect(items[3]).toHaveTextContent('!');
  });

  it('renders descriptions only where provided', () => {
    render(<Stepper steps={STEPS} />);
    const items = screen.getAllByRole('listitem');

    expect(screen.getByText('Received into the queue')).toBeInTheDocument();
    // Upcoming Test step carries no description: marker is empty, text is the label alone.
    expect(items[2].textContent).toBe('Test');
  });

  it('renders steps non-interactive without onSelect', () => {
    render(<Stepper steps={STEPS} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports step identity through onSelect when provided', () => {
    const onSelect = vi.fn();
    render(<Stepper steps={STEPS} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[2]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('test');
  });

  it('renders an empty list without throwing for empty steps', () => {
    render(<Stepper steps={[]} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('keeps multiple instances independent', () => {
    render(
      <>
        <Stepper steps={STEPS} />
        <Stepper steps={[{ id: 'only', label: 'Only', state: 'current' }]} />
      </>,
    );

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(4);
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getAllByRole('listitem', { current: 'step' })).toHaveLength(2);
  });
});
