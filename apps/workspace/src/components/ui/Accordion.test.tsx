/**
 * UI-COMP-001 Phase 7C — canonical Accordion focused suite.
 *
 * Covers the coordination contract: multiple items, controlled value,
 * onValueChange identity, single-exclusive behavior, per-item ARIA
 * states, instance-scoped ID relationships, and multi-instance
 * isolation. AccordionItem outside Accordion is a contract violation.
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
import { Accordion, AccordionItem } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

const ITEMS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

function Harness({ initial = null as string | null, onValueChange }: { initial?: string | null; onValueChange?: (v: string | null) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Accordion
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    >
      {ITEMS.map((item) => (
        <AccordionItem key={item.value} value={item.value} trigger={<span>{item.label}</span>}>
          <p>
            Content {item.value}
          </p>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function triggers(): HTMLElement[] {
  return screen.getAllByRole('button');
}

describe('Accordion (canonical @vestara/ui)', () => {
  it('renders multiple items, all closed by default', () => {
    render(<Harness />);

    expect(triggers()).toHaveLength(3);
    for (const trigger of triggers()) {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByText('Content a')).not.toBeInTheDocument();
    expect(screen.queryByText('Content b')).not.toBeInTheDocument();
  });

  it('opens the controlled item and marks its ARIA state', () => {
    render(<Harness initial="b" />);

    expect(triggers()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(triggers()[1]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers()[2]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Content b')).toBeInTheDocument();
    expect(screen.queryByText('Content a')).not.toBeInTheDocument();
  });

  it('invokes onValueChange with the selected item value', () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    fireEvent.click(triggers()[2]);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('keeps exactly one item open: selecting another closes the first', () => {
    render(<Harness initial="a" />);

    fireEvent.click(triggers()[1]);

    expect(triggers()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(triggers()[1]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Content a')).not.toBeInTheDocument();
    expect(screen.getByText('Content b')).toBeInTheDocument();
  });

  it('toggles the open item shut, reporting null', () => {
    const onValueChange = vi.fn();
    render(<Harness initial="a" onValueChange={onValueChange} />);

    fireEvent.click(triggers()[0]);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(triggers()[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('wires each trigger to its own content region without collisions', () => {
    render(<Harness initial="a" />);

    // Trigger IDs and controls are unique across items.
    const triggerIds = triggers().map((t) => t.id);
    expect(new Set(triggerIds).size).toBe(3);
    const controls = triggers().map((t) => t.getAttribute('aria-controls') ?? '');
    expect(new Set(controls).size).toBe(3);

    // The open item's region resolves and points back at its trigger.
    const openRegion = document.getElementById(controls[0]);
    expect(openRegion?.tagName).toBe('SECTION');
    expect(openRegion).toHaveAttribute('aria-labelledby', triggerIds[0]);

    // Closed items mount no region by design (Collapsible unmounts-closed).
    expect(document.getElementById(controls[1])).toBeNull();
    expect(document.getElementById(controls[2])).toBeNull();
  });

  it('isolates concurrent Accordion instances', () => {
    render(
      <>
        <Harness initial="a" />
        <Harness initial="b" />
      </>,
    );

    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(2);
    const ids = [...screen.getAllByRole('button').map((b) => b.id), ...regions.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects AccordionItem outside Accordion', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <AccordionItem value="x" trigger={<span>Orphan</span>}>
            <p>nowhere</p>
          </AccordionItem>,
        ),
      ).toThrow('AccordionItem must be used within Accordion');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
