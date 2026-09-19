/**
 * UI-COMP-001 Phase 7F — canonical Timeline focused suite.
 *
 * Covers ordered rendering, title/meta content, tone markers, empty
 * input, connector structure, standalone TimelineItem, and instance
 * independence. Ordering and timestamp formatting are consumer
 * responsibilities exercised by passing preformatted content.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Timeline, TimelineItem, type TimelineItemDefinition } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

const ITEMS: readonly TimelineItemDefinition[] = [
  { id: 'a', title: 'Repository Opened', meta: '10:00:00', tone: 'success' },
  { id: 'b', title: 'Plan Generated', meta: 'by planner', tone: 'accent' },
  { id: 'c', title: 'Verification', tone: 'muted' },
];

describe('Timeline (canonical @vestara/ui)', () => {
  it('renders items as an ordered list in consumer order', () => {
    render(<Timeline items={ITEMS} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Repository Opened');
    expect(items[1]).toHaveTextContent('Plan Generated');
    expect(items[2]).toHaveTextContent('Verification');
  });

  it('renders preformatted meta content without interpreting it', () => {
    render(<Timeline items={ITEMS} />);
    const items = screen.getAllByRole('listitem');

    expect(items[0]).toHaveTextContent('10:00:00');
    expect(items[1]).toHaveTextContent('by planner');
    // No meta provided: no secondary line content beyond the title.
    expect(items[2].textContent).toBe('Verification');
  });

  it('marks each item with its tone', () => {
    const { container } = render(<Timeline items={ITEMS} />);
    const markers = container.querySelectorAll('li > span[aria-hidden="true"] > span:first-child');

    expect(markers).toHaveLength(3);
    expect(markers[0].className).toContain('bg-[var(--vestara-status-success)]');
    expect(markers[1].className).toContain('bg-[var(--vestara-accent)]');
    expect(markers[2].className).toContain('bg-[var(--vestara-status-idle)]');
  });

  it('renders connectors between items but not after the last', () => {
    const { container } = render(<Timeline items={ITEMS} />);
    const rails = container.querySelectorAll('li > span[aria-hidden="true"]');

    expect(rails[0].querySelectorAll('span')).toHaveLength(2);
    expect(rails[1].querySelectorAll('span')).toHaveLength(2);
    expect(rails[2].querySelectorAll('span')).toHaveLength(1);
  });

  it('renders an empty list without throwing for empty items', () => {
    render(<Timeline items={[]} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('supports standalone TimelineItem rendering', () => {
    render(<TimelineItem tone="error" title="Failed" meta="12:00:00" />);

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Failed');
    expect(item).toHaveTextContent('12:00:00');
  });

  it('keeps multiple instances independent', () => {
    render(
      <>
        <Timeline items={ITEMS} />
        <Timeline items={[{ id: 'only', title: 'Only', tone: 'warning' }]} />
      </>,
    );

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(3);
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(1);
  });
});
