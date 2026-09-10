/**
 * @vestara/ui: Layout Component Tests
 *
 * Comprehensive tests for Shell, Panes, and Responsive components.
 *
 * @see packages/ui/src/components/Shell.tsx
 * @see packages/ui/src/components/Panes.tsx
 * @see packages/ui/src/components/Responsive.tsx
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Page, PageActions, PageHeader, PageTitle, SplitPane } from '../src/components/Panes';
import { Shell, ShellContent, ShellHeader, ShellInspector, ShellNavigation, useShell } from '../src/components/Shell';

// ─── Shell Tests ───────────────────────────────────────────────

describe('Shell', () => {
  it('renders children', () => {
    render(
      <Shell>
        <div>Shell content</div>
      </Shell>,
    );
    expect(screen.getByText('Shell content')).toBeInTheDocument();
  });

  it('provides shell context', () => {
    let contextValue: any = null;

    function TestComponent() {
      contextValue = useShell();
      return null;
    }

    render(
      <Shell>
        <TestComponent />
      </Shell>,
    );

    expect(contextValue).toBeTruthy();
    expect(contextValue.breakpoint).toBeDefined();
    expect(contextValue.navCollapsed).toBe(false);
    expect(contextValue.inspectorOpen).toBe(true);
  });

  it('toggles navigation', () => {
    let contextValue: any = null;

    function TestComponent() {
      contextValue = useShell();
      return <button onClick={contextValue.toggleNav}>Toggle</button>;
    }

    render(
      <Shell>
        <TestComponent />
      </Shell>,
    );

    expect(contextValue.navCollapsed).toBe(false);
    fireEvent.click(screen.getByText('Toggle'));
    expect(contextValue.navCollapsed).toBe(true);
    fireEvent.click(screen.getByText('Toggle'));
    expect(contextValue.navCollapsed).toBe(false);
  });

  it('toggles inspector', () => {
    let contextValue: any = null;

    function TestComponent() {
      contextValue = useShell();
      return <button onClick={contextValue.toggleInspector}>Toggle</button>;
    }

    render(
      <Shell>
        <TestComponent />
      </Shell>,
    );

    expect(contextValue.inspectorOpen).toBe(true);
    fireEvent.click(screen.getByText('Toggle'));
    expect(contextValue.inspectorOpen).toBe(false);
  });

  it('respects defaultNavCollapsed', () => {
    let contextValue: any = null;

    function TestComponent() {
      contextValue = useShell();
      return null;
    }

    render(
      <Shell defaultNavCollapsed>
        <TestComponent />
      </Shell>,
    );

    expect(contextValue.navCollapsed).toBe(true);
  });

  it('respects defaultInspectorOpen', () => {
    let contextValue: any = null;

    function TestComponent() {
      contextValue = useShell();
      return null;
    }

    render(
      <Shell defaultInspectorOpen={false}>
        <TestComponent />
      </Shell>,
    );

    expect(contextValue.inspectorOpen).toBe(false);
  });
});

describe('ShellHeader', () => {
  it('renders children', () => {
    render(
      <Shell>
        <ShellHeader>Header Content</ShellHeader>
      </Shell>,
    );
    expect(screen.getByText('Header Content')).toBeInTheDocument();
  });
});

describe('ShellNavigation', () => {
  it('renders children', () => {
    render(
      <Shell>
        <ShellNavigation>Nav Content</ShellNavigation>
      </Shell>,
    );
    expect(screen.getByText('Nav Content')).toBeInTheDocument();
  });
});

describe('ShellContent', () => {
  it('renders children', () => {
    render(
      <Shell>
        <ShellContent>Main Content</ShellContent>
      </Shell>,
    );
    expect(screen.getByText('Main Content')).toBeInTheDocument();
  });
});

// ─── Page Tests ────────────────────────────────────────────────

describe('Page', () => {
  it('renders children', () => {
    render(<Page>Page content</Page>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders children', () => {
    render(<PageHeader>Header content</PageHeader>);
    expect(screen.getByText('Header content')).toBeInTheDocument();
  });
});

describe('PageTitle', () => {
  it('renders title', () => {
    render(<PageTitle>Page Title</PageTitle>);
    expect(screen.getByText('Page Title')).toBeInTheDocument();
  });

  it('renders as h1', () => {
    render(<PageTitle>Test</PageTitle>);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('PageActions', () => {
  it('renders actions', () => {
    render(
      <PageActions>
        <button>Save</button>
        <button>Cancel</button>
      </PageActions>,
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
