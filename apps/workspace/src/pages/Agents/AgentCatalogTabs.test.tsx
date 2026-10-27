/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_CATALOG_TABS, AgentCatalogTabs } from './AgentCatalogTabs';

describe('AgentCatalogTabs', () => {
  it('renders every catalog tab with tab semantics', () => {
    render(<AgentCatalogTabs activeTab="all" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Agent catalog views' })).toBeInTheDocument();
    for (const tab of AGENT_CATALOG_TABS) {
      expect(screen.getByRole('tab', { name: tab.label })).toBeInTheDocument();
    }
  });

  it('marks only the active tab as selected', () => {
    render(<AgentCatalogTabs activeTab="mine" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'My Agents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'All Agents' })).toHaveAttribute('aria-selected', 'false');
  });

  it('notifies the page when a tab is picked', () => {
    const onChange = vi.fn();
    render(<AgentCatalogTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'System Agents' }));
    expect(onChange).toHaveBeenCalledWith('system');
  });
});
