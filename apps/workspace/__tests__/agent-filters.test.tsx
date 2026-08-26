import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentFilters } from '../src/pages/Agents/AgentFilters.js';
import type { Team } from '../src/pages/Agents/types.js';

function team(overrides: Partial<Team> = {}): Team {
  return { id: 't1', name: 'Platform', description: '', memberIds: [], createdAt: '', ...overrides };
}

function renderFilters(onChange: (filters: unknown) => void = () => {}) {
  return render(<AgentFilters teams={[team()]} resultCount={3} totalSlots={16} onChange={onChange} />);
}

afterEach(() => {
  cleanup();
});

describe('AgentFilters', () => {
  it('reports search input changes with the full filter state', () => {
    const onChange = vi.fn();
    renderFilters(onChange);
    fireEvent.change(screen.getByPlaceholderText('Search by name, role, capability...'), {
      target: { value: 'planner' },
    });
    expect(onChange).toHaveBeenCalledWith({ search: 'planner', status: 'all', team: 'all' });
  });

  it('reports the status filter when a status button is selected', () => {
    const onChange = vi.fn();
    renderFilters(onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onChange).toHaveBeenCalledWith({ search: '', status: 'active', team: 'all' });
  });

  it('reports the team filter when a team is selected', () => {
    const onChange = vi.fn();
    renderFilters(onChange);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 't1' } });
    expect(onChange).toHaveBeenCalledWith({ search: '', status: 'all', team: 't1' });
  });

  it('renders the result count against the total slot count', () => {
    renderFilters();
    expect(screen.getByText('3 of 16')).toBeTruthy();
  });
});
