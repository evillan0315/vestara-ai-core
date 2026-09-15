// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Overview from '../src/pages/Overview';
import { overviewFixture } from '../src/features/overview/overview.fixtures';

vi.mock('../src/features/overview/hooks/useOverview', () => ({
  useOverview: vi.fn(),
}));

vi.mock('../src/hooks/useMorningBriefing', () => ({
  useMorningBriefing: vi.fn(() => ({ briefing: null, loading: false })),
}));

import { useOverview } from '../src/features/overview/hooks/useOverview';

const mocked = vi.mocked(useOverview);

// Overview renders inside ShellLayout's Outlet in production — Links need a
// Router context, so tests mount inside MemoryRouter.
function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <Overview />
    </MemoryRouter>,
  );
}

describe('Overview Page (v2 dark premium)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mocked.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByLabelText(/Loading overview/)).toBeTruthy();
  });

  it('renders hero + sections with fixture data', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    // Hero shows a time-aware greeting, not a rotating title
    expect(screen.getByText(/Director/)).toBeTruthy();
    expect(screen.getByText('Continue Working')).toBeTruthy();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText("Today's Focus")).toBeTruthy();
  });

  it('renders quick actions', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByText('New Project')).toBeTruthy();
    expect(screen.getByText('Create Workflow')).toBeTruthy();
    expect(screen.getByText('Open Files')).toBeTruthy();
    expect(screen.getByText('Launch Terminal')).toBeTruthy();
    // Marketplace removed from quick actions — it's in the global nav
    expect(screen.queryByText('Explore Marketplace')).toBeNull();
  });

  it('renders agent summary row', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    // AgentStatus is now a compact summary: "5 agents · 2 online · 1 busy · 1 idle · 1 offline"
    expect(screen.getByText(/5 agents ·/)).toBeTruthy();
  });

  it('renders system status bar', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    // SystemResources is now a compact status bar with percentage readouts
    expect(screen.getByText('CPU')).toBeTruthy();
    expect(screen.getByText('18%')).toBeTruthy();
    expect(screen.getByText('Mem')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
  });

  it('shows cached snapshot note with retry when live fetch failed', () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: 'network down', refetch });
    renderOverview();
    expect(screen.getByText(/cached snapshot/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('uses shell client-side navigation (no full-page reload links)', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    // Quick actions navigate inside the shell via react-router Links.
    const projectLink = screen.getByRole('link', { name: /New Project/ });
    expect(projectLink.getAttribute('href')).toBe('/projects');
    // Section shortcuts route to their shell surfaces.
    const viewAllHrefs = screen.getAllByRole('link', { name: 'View All' }).map((a) => a.getAttribute('href'));
    expect(viewAllHrefs).toContain('/projects');
    expect(viewAllHrefs).toContain('/agents');
    for (const href of viewAllHrefs) {
      expect(href).toMatch(/^\/(projects|agents|activity|diagnostics)$/);
    }
  });
});
