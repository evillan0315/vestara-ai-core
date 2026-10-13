/**
 * WorkspaceTabLayout focused suite: rail + panel composition contract.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceTabLayout } from './WorkspaceTabLayout.js';
import { WorkspaceTabs } from './WorkspaceTabs.js';

afterEach(() => {
  cleanup();
});

describe('WorkspaceTabLayout', () => {
  it('renders the rail navigation and the active panel content', () => {
    const { container } = render(
      <WorkspaceTabLayout
        rail={
          <WorkspaceTabs
            orientation="vertical"
            tabs={[{ id: 'a', label: 'Alpha', borderBottom: false }]}
            activeTab="a"
            onTabChange={() => {}}
            ariaLabel="Sections"
          />
        }
      >
        <div>Panel body</div>
      </WorkspaceTabLayout>,
    );

    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(container.querySelector('.tab-layout')).toBeInTheDocument();
  });

  it('merges root/rail/panel class overrides without dropping the layout contract', () => {
    const { container } = render(
      <WorkspaceTabLayout rail={<div>Rail</div>} className="custom-root" railClassName="custom-rail" contentClassName="custom-panel">
        <div>Body</div>
      </WorkspaceTabLayout>,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass('tab-layout', 'custom-root');
    const rail = root?.children[0];
    expect(rail).toHaveClass('tab-sidebar', 'tab-sidebar--left', 'custom-rail');
    // Sidebars fit the screen height like the panel, with their own scroll guard.
    expect(rail).toHaveClass('lg:min-h-0', 'lg:self-stretch', 'lg:overflow-y-auto');
    const content = root?.children[1];
    expect(content).toHaveClass('tab-content', 'custom-panel');
    // The content frame never scrolls itself — the body owns the scroll.
    expect(content).not.toHaveClass('lg:overflow-y-auto');
    const body = content?.children[0];
    expect(body).toHaveClass('tab-content-body', 'lg:overflow-y-auto');
  });

  it('pins the header above the scrolling body when provided', () => {
    const { container } = render(
      <WorkspaceTabLayout
        rail={<div>Rail</div>}
        header={<div>Section title</div>}
        headerClassName="custom-header"
        bodyClassName="custom-body"
      >
        <div>Body</div>
      </WorkspaceTabLayout>,
    );

    expect(screen.getByText('Section title')).toBeInTheDocument();
    const content = container.firstElementChild?.children[1];
    expect(content?.children[0]).toHaveClass('tab-content-header', 'custom-header');
    expect(content?.children[0]).not.toHaveClass('lg:overflow-y-auto');
    expect(content?.children[1]).toHaveClass('tab-content-body', 'custom-body', 'lg:overflow-y-auto');
  });

  it('pins an optional footer below the scrolling body and omits it when absent', () => {
    const { container, rerender } = render(
      <WorkspaceTabLayout rail={<div>Rail</div>}>
        <div>Body</div>
      </WorkspaceTabLayout>,
    );
    // No header, no footer: the body is the only content child.
    expect(container.firstElementChild?.children[1]?.children).toHaveLength(1);

    rerender(
      <WorkspaceTabLayout rail={<div>Rail</div>} footer={<div>Save bar</div>} footerClassName="custom-footer">
        <div>Body</div>
      </WorkspaceTabLayout>,
    );
    expect(screen.getByText('Save bar')).toBeInTheDocument();
    const content = container.firstElementChild?.children[1];
    expect(content?.children).toHaveLength(2);
    expect(content?.children[0]).toHaveClass('tab-content-body', 'lg:overflow-y-auto');
    expect(content?.children[1]).toHaveClass('tab-content-footer', 'custom-footer');
    expect(content?.children[1]).not.toHaveClass('lg:overflow-y-auto');
  });

  it('renders no context region unless the context slot is provided', () => {
    const { container, rerender } = render(
      <WorkspaceTabLayout rail={<div>Rail</div>}>
        <div>Body</div>
      </WorkspaceTabLayout>,
    );
    expect(container.firstElementChild?.children).toHaveLength(2);

    rerender(
      <WorkspaceTabLayout rail={<div>Rail</div>} context={<div>Side notes</div>} contextClassName="custom-context">
        <div>Body</div>
      </WorkspaceTabLayout>,
    );
    expect(screen.getByText('Side notes')).toBeInTheDocument();
    const root = container.firstElementChild;
    expect(root?.children).toHaveLength(3);
    expect(root?.children[2]).toHaveClass('tab-sidebar', 'tab-sidebar--right', 'custom-context');
    expect(root?.children[2]).toHaveClass('lg:min-h-0', 'lg:self-stretch', 'lg:overflow-y-auto');
  });
});
