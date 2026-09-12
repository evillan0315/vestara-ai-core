// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Overview from '../src/pages/Overview';
import { overviewFixture } from '../src/features/overview/overview.fixtures';

vi.mock('../src/features/overview/hooks/useOverview', () => ({
  useOverview: vi.fn(),
}));

import { useOverview } from '../src/features/overview/hooks/useOverview';

const mocked = vi.mocked(useOverview);

// Overview renders inside ShellLayout's Outlet in production — Links need a
// Router context, so tests mount inside MemoryRouter.
function renderOverview() {
  return render(
    <MemoryRouter>
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

  it('renders v2 hero + sections with fixture data', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByText('Build Without Limits')).toBeTruthy();
    expect(screen.getByText('Continue Working')).toBeTruthy();
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Agents Status')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('System Resources')).toBeTruthy();
    expect(screen.getByText('Marketplace Spotlight')).toBeTruthy();
    expect(screen.getByText("Today's Focus")).toBeTruthy();
  });

  it('renders quick actions', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByText('New Project')).toBeTruthy();
    expect(screen.getByText('Create Workflow')).toBeTruthy();
    expect(screen.getByText('Open Files')).toBeTruthy();
    expect(screen.getByText('Launch Terminal')).toBeTruthy();
    expect(screen.getByText('Explore Marketplace')).toBeTruthy();
  });

  it('renders agent presence rows', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByText('vestara-planner')).toBeTruthy();
    expect(screen.getByText('vestara-developer')).toBeTruthy();
    expect(screen.getAllByText('Online').length).toBeGreaterThan(0);
  });

  it('renders system gauges', () => {
    mocked.mockReturnValue({ data: overviewFixture, isLoading: false, error: null, refetch: vi.fn() });
    renderOverview();
    expect(screen.getByLabelText(/CPU 18 percent/)).toBeTruthy();
    expect(screen.getByLabelText(/Memory 62 percent/)).toBeTruthy();
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
      expect(href).toMatch(/^\/(projects|agents|activity|marketplace|diagnostics)$/);
    }
  });
});
