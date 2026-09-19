/**
 * UI-COMP-001 Phase 7D — canonical ProgressIndicator focused suite.
 *
 * Covers value semantics (zero/partial/complete/custom max), boundary
 * normalization (below minimum, above maximum, non-finite, invalid max),
 * progressbar accessibility, and instance independence.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressIndicator } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

function bar(name = 'Upload'): HTMLElement {
  return screen.getByRole('progressbar', { name });
}

describe('ProgressIndicator (canonical @vestara/ui)', () => {
  it('renders zero progress with an empty fill', () => {
    render(<ProgressIndicator value={0} label="Upload" />);

    const indicator = bar();
    expect(indicator).toHaveAttribute('aria-valuemin', '0');
    expect(indicator).toHaveAttribute('aria-valuemax', '100');
    expect(indicator).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders partial progress with proportional width', () => {
    const { container } = render(<ProgressIndicator value={25} label="Upload" />);

    expect(bar()).toHaveAttribute('aria-valuenow', '25');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('25%');
  });

  it('renders complete progress at full width', () => {
    const { container } = render(<ProgressIndicator value={100} label="Upload" />);

    expect(bar()).toHaveAttribute('aria-valuenow', '100');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('supports a custom max', () => {
    const { container } = render(<ProgressIndicator value={3} max={6} label="Tasks" />);

    expect(screen.getByRole('progressbar', { name: 'Tasks' })).toHaveAttribute('aria-valuemax', '6');
    expect(screen.getByRole('progressbar', { name: 'Tasks' })).toHaveAttribute('aria-valuenow', '3');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('normalizes values below the minimum to zero', () => {
    const { container } = render(<ProgressIndicator value={-40} label="Upload" />);

    expect(bar()).toHaveAttribute('aria-valuenow', '0');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('normalizes values above the maximum to the max', () => {
    const { container } = render(<ProgressIndicator value={250} label="Upload" />);

    expect(bar()).toHaveAttribute('aria-valuenow', '100');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('normalizes non-finite values and invalid max values safely', () => {
    const { container, rerender } = render(<ProgressIndicator value={Number.NaN} label="Upload" />);
    expect(bar()).toHaveAttribute('aria-valuenow', '0');

    rerender(<ProgressIndicator value={Infinity} label="Upload" />);
    expect(bar()).toHaveAttribute('aria-valuenow', '0');

    // Invalid max falls back to 100; the value is then clamped to it.
    rerender(<ProgressIndicator value={50} max={0} label="Upload" />);
    expect(bar()).toHaveAttribute('aria-valuemax', '100');
    expect(bar()).toHaveAttribute('aria-valuenow', '50');

    rerender(<ProgressIndicator value={50} max={Number.NaN} label="Upload" />);
    expect(bar()).toHaveAttribute('aria-valuemax', '100');
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('keeps multiple instances independent', () => {
    render(
      <>
        <ProgressIndicator value={20} label="First" />
        <ProgressIndicator value={80} tone="error" label="Second" />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'First' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('progressbar', { name: 'Second' })).toHaveAttribute('aria-valuenow', '80');
  });
});
