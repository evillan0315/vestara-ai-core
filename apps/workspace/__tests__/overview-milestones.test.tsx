// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesSummary } from '../src/features/overview/components/MilestonesSummary';

const PAYLOAD = {
  milestones: [
    { version: 'v9.9', name: 'Done Thing', era: 'Past', status: 'completed', description: 'Already done.' },
    { version: 'CI-OBS-001', name: 'CI Observation', era: 'CI', status: 'in_progress', description: 'Observe CI.' },
    { version: 'UIM-001', name: 'Identity Audit', era: 'Identity', status: 'pending', description: 'Audit identity.' },
    { version: 'v9.0', name: 'Enterprise Scale', era: 'Growth', status: 'pending', description: 'Scale.' },
  ],
  byEra: {},
  current: { version: 'CI-OBS-001', name: 'CI Observation', era: 'CI', status: 'in_progress', description: 'Observe CI.' },
  progress: { total: 4, completed: 1, inProgress: 1, pending: 2 },
};

function stubMilestones(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/milestones')) {
        return { ok, json: async () => payload } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }),
  );
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <MilestonesSummary />
    </MemoryRouter>,
  );
}

describe('MilestonesSummary (Overview projection, authority-read-only)', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders status summary counts from authority state, never fabricated', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    expect(await screen.findByText('CI Observation')).toBeTruthy();
    expect(screen.getByText('Active · 1')).toBeTruthy();
    expect(screen.getByText('Pending · 2')).toBeTruthy();
    expect(screen.getByText('Done · 1')).toBeTruthy();
    expect(screen.getByText('Planned · 0')).toBeTruthy();
    expect(screen.getByText('Future · 0')).toBeTruthy();
  });

  it('shows aggregate authoritative progress, not per-milestone invention', async () => {
    stubMilestones(PAYLOAD);
    const { container } = renderCard();
    await screen.findByText('CI Observation');
    const bar = container.querySelector('[role="progressbar"][aria-label="Overall milestone progress"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('1 of 4 done')).toBeTruthy();
  });

  it('lists rows with id, title, status, and era — no phase invention', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    await screen.findByText('CI Observation');
    // All shows the full authoritative list, including completed rows.
    expect(screen.getByText('Identity Audit')).toBeTruthy();
    expect(screen.getByText('Enterprise Scale')).toBeTruthy();
    expect(screen.getByText('Done Thing')).toBeTruthy();
    // Era shown honestly labeled (aria via title on row).
    expect(screen.getByText('CI')).toBeTruthy();
  });

  it('filters rows by status without touching authority state', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    await screen.findByText('CI Observation');
    fireEvent.click(screen.getByRole('button', { name: /Pending/ }));
    expect(screen.queryByText('CI Observation')).toBeNull();
    expect(screen.getByText('Identity Audit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Active/ }));
    expect(screen.getByText('CI Observation')).toBeTruthy();
    expect(screen.queryByText('Enterprise Scale')).toBeNull();
  });

  it('drills down: All shows every authoritative row; Done shows completed only', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    await screen.findByText('CI Observation');
    expect(screen.getByText('CI Observation')).toBeTruthy();
    expect(screen.getByText('Identity Audit')).toBeTruthy();
    expect(screen.getByText('Enterprise Scale')).toBeTruthy();
    expect(screen.getByText('Done Thing')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(screen.getByText('Done Thing')).toBeTruthy();
    expect(screen.queryByText('CI Observation')).toBeNull();
    expect(screen.queryByText('Identity Audit')).toBeNull();
  });

  it('renders truthful empty states for Planned and Future', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    await screen.findByText('CI Observation');
    fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
    expect(screen.getByText(/No milestones in Planned — the milestone authority exposes no corresponding state/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Future/ }));
    expect(screen.getByText(/No milestones in Future — the milestone authority exposes no corresponding state/)).toBeTruthy();
  });

  it('marks the selected status identifiably and keeps counts consistent with rows', async () => {
    stubMilestones(PAYLOAD);
    renderCard();
    await screen.findByText('CI Observation');
    const doneChip = screen.getByRole('button', { name: /Done/ });
    expect(doneChip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(doneChip);
    expect(doneChip.getAttribute('aria-pressed')).toBe('true');
    expect(doneChip.className).toContain('var(--vestara-accent-text)');
    // Counts derive from the same dataset as rows: Done · 1 matches one row.
    expect(doneChip.textContent).toContain('1');
  });

  it('never mutates milestone state (read-only projection)', async () => {
    const methods: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string }) => {
        methods.push(init?.method ?? 'GET');
        if (String(url).includes('/api/milestones')) {
          return { ok: true, json: async () => PAYLOAD } as Response;
        }
        return { ok: false, json: async () => ({}) } as Response;
      }),
    );
    renderCard();
    await screen.findByText('CI Observation');
    fireEvent.click(screen.getByRole('button', { name: /Pending/ }));
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => method === 'GET')).toBe(true);
  });

  it('bounds large lists in a scrollable container', async () => {
    stubMilestones(PAYLOAD);
    const { container } = renderCard();
    await screen.findByText('CI Observation');
    const list = container.querySelector('ul');
    expect(list?.className).toContain('overflow-y-auto');
    expect(list?.className).toContain('max-h-80');
  });

  it('holds the priority dimension honestly instead of inventing values', async () => {
    stubMilestones(PAYLOAD);
    const { container } = renderCard();
    await screen.findByText('CI Observation');
    expect(container.textContent).toMatch(/Priority is not tracked by the milestone authority/);
    expect(container.textContent).not.toMatch(/Critical|High priority|Medium priority/);
  });

  it('renders an honest unavailable state when the authority does not respond', async () => {
    stubMilestones(null, false);
    renderCard();
    expect(await screen.findByText(/Milestone data unavailable/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('CI Observation')).toBeNull());
  });

  it('uses only canonical tokens (no hardcode)', async () => {
    stubMilestones(PAYLOAD);
    const { container } = renderCard();
    await screen.findByText('CI Observation');
    const html = container.innerHTML;
    expect(html).toContain('var(--vestara-');
    expect(html).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/);
    expect(html).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
    expect(html).not.toContain('#f59e0b');
  });

  it('renders identically under light theme (token-driven)', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.add('light');
    stubMilestones(PAYLOAD);
    const { container } = renderCard();
    await screen.findByText('CI Observation');
    expect(container.innerHTML).toContain('var(--vestara-');
    expect(screen.getByText('Active · 1')).toBeTruthy();
    document.documentElement.classList.remove('light');
  });

  it("places Milestones in the left column after Today's Focus", async () => {
    const { OverviewScreen } = await import('../src/features/overview/OverviewScreen.js');
    stubMilestones(PAYLOAD);
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <OverviewScreen />
      </MemoryRouter>,
    );
    const focus = await screen.findByRole('region', { name: "Today's Focus" });
    const milestones = await screen.findByRole('region', { name: 'Milestones' });
    expect(focus.compareDocumentPosition(milestones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
