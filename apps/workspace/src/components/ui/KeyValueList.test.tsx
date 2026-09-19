/**
 * UI-COMP-001 Phase 7G — canonical KeyValueList focused suite.
 *
 * Covers semantic dl/dt/dd structure, supplied order, ReactNode values,
 * empty input, long-value containment, truncation with accessible full
 * value, and instance independence.
 *
 * Runs under the workspace runner (jsdom + Testing Library live here;
 * pnpm strict mode cannot resolve them from packages/ui).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyValueList } from '@vestara/ui';

// Hermetic under both runners (see Tabs.test.tsx).
afterEach(() => {
  cleanup();
});

describe('KeyValueList (canonical @vestara/ui)', () => {
  it('renders a semantic definition list preserving supplied order', () => {
    const { container } = render(
      <KeyValueList
        items={[
          { id: 'size', label: 'Size', value: '4.1 KB' },
          { id: 'modified', label: 'Modified', value: '10:00:00' },
        ]}
      />,
    );

    // dl carries no implicit ARIA role; assert the element directly.
    const list = container.querySelector('dl');
    expect(list).not.toBeNull();
    const terms = within(list as HTMLElement).getAllByRole('term');
    const definitions = within(list as HTMLElement).getAllByRole('definition');
    expect(terms.map((t) => t.textContent)).toEqual(['Size', 'Modified']);
    expect(definitions.map((d) => d.textContent)).toEqual(['4.1 KB', '10:00:00']);
  });

  it('renders ReactNode values', () => {
    render(
      <KeyValueList
        items={[{ id: 'path', label: 'Path', value: <span className="font-mono text-xs">src/index.ts</span> }]}
      />,
    );

    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts').tagName).toBe('SPAN');
  });

  it('wraps long values by default so no text is lost', () => {
    const long = `a-very-long-unbroken-value-${'x'.repeat(120)}`;
    const { container } = render(<KeyValueList items={[{ id: 'digest', label: 'Digest', value: long }]} />);

    const dd = container.querySelector('dd') as HTMLElement;
    expect(dd.textContent).toBe(long);
    expect(dd.className).not.toContain('truncate');
    expect(dd).not.toHaveAttribute('title');
  });

  it('truncates opt-in values while keeping the full string accessible', () => {
    const path = `/home/user/projects/vestara-ai-core/${'nested/'.repeat(10)}file.ts`;
    const { container } = render(<KeyValueList items={[{ id: 'path', label: 'Path', value: path, truncate: true }]} />);

    const dd = container.querySelector('dd') as HTMLElement;
    expect(dd.className).toContain('truncate');
    expect(dd).toHaveAttribute('title', path);
    expect(dd.textContent).toBe(path);
  });

  it('truncates ReactNode values while leaving titles to the consumer', () => {
    const { container } = render(
      <KeyValueList
        items={[
          {
            id: 'path',
            label: 'Path',
            value: (
              <span title="full-path" className="font-mono text-xs">
                src/index.ts
              </span>
            ),
            truncate: true,
          },
        ]}
      />,
    );

    const dd = container.querySelector('dd') as HTMLElement;
    expect(dd.className).toContain('truncate');
    expect(dd).not.toHaveAttribute('title');
    expect(screen.getByTitle('full-path')).toHaveTextContent('src/index.ts');
  });

  it('renders an empty list without throwing for empty items', () => {
    const { container } = render(<KeyValueList items={[]} />);

    expect(container.querySelector('dl')).not.toBeNull();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });

  it('keeps multiple instances independent', () => {
    render(
      <>
        <KeyValueList items={[{ id: 'a', label: 'Alpha', value: '1' }]} />
        <KeyValueList items={[{ id: 'b', label: 'Beta', value: '2' }]} />
      </>,
    );

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
