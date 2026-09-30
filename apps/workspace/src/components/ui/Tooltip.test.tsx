/** @vitest-environment jsdom */

/**
 * AR-TOOLTIP-001-03 — reusable Tooltip contract.
 *
 * Covers the @vestara/ui Tooltip through its public surface:
 * - hidden until hover/focus, describedby linkage while visible;
 * - disabled never opens; long strings capped; Escape dismisses.
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip } from '@vestara/ui';

describe('AR-TOOLTIP-001 Tooltip', () => {
  it('hides the panel until hovered, then links it via describedby', async () => {
    render(<Tooltip content="Full message body">trigger</Tooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('trigger'));
    const panel = await screen.findByRole('tooltip');
    expect(panel).toHaveTextContent('Full message body');
    expect(screen.getByText('trigger')).toHaveAttribute('aria-describedby', panel.id);
    fireEvent.mouseLeave(screen.getByText('trigger'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('never opens while disabled', async () => {
    render(
      <Tooltip content="Full message body" disabled>
        trigger
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('trigger'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('caps long string content with an ellipsis', async () => {
    render(
      <Tooltip content={'x'.repeat(700)} maxLength={600}>
        trigger
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('trigger'));
    const panel = await screen.findByRole('tooltip');
    expect(panel.textContent).toHaveLength(601);
    expect(panel.textContent?.endsWith('…')).toBe(true);
  });

  it('renders on the requested placement with the accent overlay', async () => {
    render(
      <Tooltip content="body" placement="bottom">
        trigger
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('trigger'));
    const panel = await screen.findByRole('tooltip');
    expect(panel.className).toContain('top-full');
    expect(panel.className).toContain('bg-[var(--vestara-accent-overlay)]');
  });

  it('dismisses on Escape', async () => {
    render(<Tooltip content="body">trigger</Tooltip>);
    fireEvent.mouseEnter(screen.getByText('trigger'));
    await screen.findByRole('tooltip');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
