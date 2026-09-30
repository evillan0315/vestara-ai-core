/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceOperationalPanel } from './WorkspaceOperationalPanel';

describe('WorkspaceOperationalPanel', () => {
  it('renders the shared header composition and arbitrary content', () => {
    render(
      <WorkspaceOperationalPanel
        icon={<span data-testid="panel-icon" />}
        title="Workspace Status"
        description="Current health"
        actions={<button type="button">Refresh</button>}
      >
        <div>Panel body</div>
      </WorkspaceOperationalPanel>,
    );

    expect(screen.getByRole('heading', { name: 'Workspace Status' })).toBeInTheDocument();
    expect(screen.getByText('Current health')).toBeInTheDocument();
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Workspace Status' })).toBeInTheDocument();
  });

  it('supports iconless panels and structural fill/scroll semantics', () => {
    render(
      <WorkspaceOperationalPanel title="Details" fill scrollable>
        <div>Content</div>
      </WorkspaceOperationalPanel>,
    );

    const panel = screen.getByRole('region', { name: 'Details' });
    expect(panel).toHaveClass('st-card-fill', 'st-card-fixed');
    expect(panel.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
