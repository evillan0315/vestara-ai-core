/**
 * UI-COMP-001 Phase 7A.1 — canonical Tabs focused suite.
 *
 * Covers the promotion contract of @vestara/ui Tabs:
 * roles/ARIA wiring, controlled selection, roving tabindex, keyboard
 * navigation (including disabled-tab skipping), and instance-scoped IDs.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@vestara/ui';

// Hermetic under both runners: the root runner cleans via vitest.setup.ts,
// the workspace runner relies on RTL globals — belt and suspenders here.
afterEach(() => {
  cleanup();
});

// NOTE: shortLabel is intentionally omitted. The component renders both the
// label and shortLabel spans and relies on responsive CSS (hidden/sm:inline)
// to show one; jsdom applies no CSS, so both spans concatenate in the
// accessible name. Browser behavior is unchanged and out of scope for 7A.1.
const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'work', label: 'Work' }, { id: 'activity', label: 'Activity' }] as const;

function Harness({  tabs = [...TABS],
  initial = 'overview',
  onTabChange,
}: {
  tabs?: { id: string; label: string; shortLabel?: string; disabled?: boolean }[];
  initial?: string;
  onTabChange?: (id: string) => void;
}) {
  const [active, setActive] = useState(initial);
  return (
    <Tabs
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => {
        setActive(id);
        onTabChange?.(id);
      }}
    >
      <div>Panel: {active}</div>
    </Tabs>
  );
}

// Positional tab access. The component renders label + shortLabel spans and
// relies on responsive CSS to show one; jsdom applies no CSS, so accessible
// names always concatenate (e.g. "WorkWork"). Index queries keep the suite
// browser-honest without depending on that artifact.
function tabAt(index: number): HTMLElement {
  return screen.getAllByRole('tab')[index];
}

describe('Tabs (canonical @vestara/ui)', () => {
  it('exposes tablist/tab/tabpanel roles with roving tabindex', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel: overview');

    // Active tab is selected and tabbable; the rest are roved out.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[2]).toHaveAttribute('tabindex', '-1');
  });

  it('selects a tab on click and moves the panel', () => {
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);

    fireEvent.click(tabAt(1));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('work');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel: work');
    expect(tabAt(1)).toHaveAttribute('aria-selected', 'true');
  });

  it('moves selection with ArrowRight and focuses the new tab', () => {
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);

    fireEvent.keyDown(tabAt(0), { key: 'ArrowRight' });

    expect(onTabChange).toHaveBeenCalledWith('work');
    expect(tabAt(1)).toHaveFocus();
  });

  it('wraps ArrowLeft from the first tab to the last tab', () => {
    const onTabChange = vi.fn();
    render(<Harness onTabChange={onTabChange} />);

    fireEvent.keyDown(tabAt(0), { key: 'ArrowLeft' });

    expect(onTabChange).toHaveBeenCalledWith('activity');
    expect(tabAt(2)).toHaveFocus();
  });

  it('jumps with Home and End', () => {
    const onTabChange = vi.fn();
    render(<Harness initial="work" onTabChange={onTabChange} />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(onTabChange).toHaveBeenNthCalledWith(1, 'overview');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'activity');
  });

  it('skips disabled tabs in keyboard navigation and blocks clicks', () => {
    const onTabChange = vi.fn();
    render(
      <Harness
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'work', label: 'Work', disabled: true },
          { id: 'activity', label: 'Activity' },
        ]}
        onTabChange={onTabChange}
      />,
    );

    const disabled = tabAt(1);
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(disabled);
    expect(onTabChange).not.toHaveBeenCalled();

    // ArrowRight from Overview must land on Activity, not Work.
    fireEvent.keyDown(tabAt(0), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('activity');
    expect(tabAt(2)).toHaveFocus();
  });

  it('scopes tab/panel IDs per instance so concurrent instances never collide', () => {
    render(
      <>
        <Harness />
        <Harness initial="work" />
      </>,
    );

    const tablists = screen.getAllByRole('tablist');
    expect(tablists).toHaveLength(2);
    const firstIds = within(tablists[0]).getAllByRole('tab').map((t) => t.id);
    const secondIds = within(tablists[1]).getAllByRole('tab').map((t) => t.id);
    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
    }

    // Each panel is labelled by its own instance tab.
    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      const labelledBy = panel.getAttribute('aria-labelledby') ?? '';
      expect(document.getElementById(labelledBy)).not.toBeNull();
    }
  });
});
