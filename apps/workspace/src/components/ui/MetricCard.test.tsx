/**
 * UI-COMP-001 Phase 7G — canonical MetricCard focused suite.
 *
 * Covers label/value rendering, optional hint, tone treatment, absence
 * of false interactivity, and instance independence.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricCard } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

describe('MetricCard (canonical @vestara/ui)', () => {
  it('renders label above value in DOM order', () => {
    const { container } = render(<MetricCard label="Nodes" value={12} />);

    expect(screen.getByText('Nodes')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    const order = root.textContent ?? '';
    expect(order.indexOf('Nodes')).toBeLessThan(order.indexOf('12'));
  });

  it('renders ReactNode values verbatim', () => {
    render(
      <MetricCard
        label="Success Rate"
        value={
          <span>
            87<strong>%</strong>
          </span>
        }
      />,
    );

    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('renders the optional hint below the value', () => {
    render(<MetricCard label="Online" value={3} hint="2 agents idle" />);

    expect(screen.getByText('2 agents idle')).toBeInTheDocument();
  });

  it('applies the tone as a decorative accent treatment', () => {
    const { container, rerender } = render(<MetricCard label="Failed" value={2} tone="error" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('border-l-[var(--vestara-status-error)]');

    rerender(<MetricCard label="Online" value={3} tone="success" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('border-l-[var(--vestara-status-success)]');

    // Default tone is accent.
    rerender(<MetricCard label="Nodes" value={12} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('border-l-[var(--vestara-accent)]');
  });

  it('exposes no interactive semantics', () => {
    render(<MetricCard label="Nodes" value={12} hint="cluster total" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps multiple instances independent', () => {
    render(
      <>
        <MetricCard label="Nodes" value={12} />
        <MetricCard label="Online" value={3} tone="success" />
      </>,
    );

    expect(screen.getByText('Nodes')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
