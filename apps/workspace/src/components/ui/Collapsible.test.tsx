/**
 * UI-COMP-001 Phase 7B — canonical Collapsible focused suite.
 *
 * Covers the leaf disclosure contract: closed/open rendering, trigger
 * activation (pointer + keyboard), aria-expanded, trigger/content ARIA
 * relationship, and instance-scoped IDs.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Collapsible } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

function Harness({ initial = false, onOpenChange }: { initial?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(initial);
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      trigger={<span>Details</span>}
    >
      <p>Hidden content</p>
    </Collapsible>
  );
}

describe('Collapsible (canonical @vestara/ui)', () => {
  it('renders closed with collapsed semantics and no content', () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('renders open with expanded semantics and mounted content', () => {
    render(<Harness initial />);

    const trigger = screen.getByRole('button', { name: 'Details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden content')).toBeInTheDocument();
  });

  it('invokes onOpenChange with the toggled state on trigger click', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Hidden content')).toBeInTheDocument();
  });

  it('wires the trigger/content ARIA relationship both ways', () => {
    render(<Harness initial />);

    const trigger = screen.getByRole('button', { name: 'Details' });
    const region = screen.getByRole('region');
    const controls = trigger.getAttribute('aria-controls') ?? '';

    expect(controls).not.toBe('');
    expect(region).toHaveAttribute('id', controls);
    expect(region).toHaveAttribute('aria-labelledby', trigger.id);
    expect(trigger.id).not.toBe('');
  });

  it('uses a native button trigger so keyboard activation comes from the platform', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Details' });

    // Native <button type="button">: Enter/Space activation, focusability,
    // and disabled semantics are platform-guaranteed — jsdom cannot
    // synthesize the browser's implicit key→click dispatch, so the
    // contract asserted here is the element itself.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');

    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByText('Hidden content')).toBeInTheDocument();
  });

  it('scopes trigger/content IDs per instance so concurrent instances never collide', () => {
    render(
      <>
        <Harness initial />
        <Harness initial />
      </>,
    );

    const triggers = screen.getAllByRole('button', { name: 'Details' });
    expect(triggers).toHaveLength(2);
    expect(triggers[0].id).not.toBe(triggers[1].id);
    expect(triggers[0].getAttribute('aria-controls')).not.toBe(triggers[1].getAttribute('aria-controls'));

    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      const labelledBy = region.getAttribute('aria-labelledby') ?? '';
      const trigger = document.getElementById(labelledBy);
      expect(trigger?.tagName).toBe('BUTTON');
      // Each region resolves to its own trigger, and back.
      expect(trigger).toHaveAttribute('aria-controls', region.id);
    }
  });
});
