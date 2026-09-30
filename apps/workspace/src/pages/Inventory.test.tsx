/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Inventory from '../components/inventory/InventoryPanel';
import InventoryDrawer from '../components/inventory/InventoryDrawer';

const rows = [
  {
    targetId: 'AR-CAP-01',
    category: 'capability' as const,
    disposition: 'represented' as const,
    assertionCount: 1,
    historicalEvidenceLinkCount: 2,
    hasUnresolvedQuestion: false,
    hasConflict: false,
    stratum: 'design-lineage',
    description: 'A represented capability.',
  },
  {
    targetId: 'AR-CAP-08',
    category: 'capability' as const,
    disposition: 'unresolved' as const,
    assertionCount: 2,
    historicalEvidenceLinkCount: 4,
    hasUnresolvedQuestion: true,
    hasConflict: true,
    stratum: 'design-lineage',
    description: 'A conflicting capability.',
  },
  {
    targetId: 'DEP-01',
    category: 'dependency' as const,
    disposition: 'represented' as const,
    assertionCount: 1,
    historicalEvidenceLinkCount: 1,
    hasUnresolvedQuestion: false,
    hasConflict: false,
    stratum: 'design-lineage',
    description: 'A represented dependency.',
  },
];

const summary = {
  totalTargets: 48,
  capabilities: 25,
  dependencies: 23,
  represented: 42,
  unresolved: 6,
  excluded: 0,
  conflicts: 4,
  assertions: 52,
  historicalEvidenceLinks: 85,
  stratum: 'design-lineage',
};

const detail = {
  ...rows[1],
  assertions: [
    {
      id: 'r3-original-ar-cap-08',
      statement: 'The frozen audit recorded conflicting historical evidence.',
      status: 'asserted' as const,
      stratum: 'design-lineage',
      evidenceLinkCount: 2,
      evidence: [
        {
          role: 'supporting' as const,
          artifactDigest: '8e43b592a37ad71adac1792e0d73f5c1370ff40469e4a9a255986b437ebc5e3a',
          artifact: 'original' as const,
          anchorKind: 'inventory-capability',
          anchorValue: 'AR-CAP-08',
        },
        {
          role: 'contesting' as const,
          artifactDigest: '154350501d21af433e80646401e06f54aaa7751acf5858417a28b0e81ca66a95',
          artifact: 'overlay' as const,
          anchorKind: 'inventory-capability',
          anchorValue: 'AR-CAP-08',
        },
      ],
    },
  ],
  unresolvedQuestion: {
    id: 'r3-unresolved-ar-cap-08',
    question: 'What is the reconciled status?',
    reason: 'conflicting-evidence',
    stratum: 'unresolved',
  },
  conflict: {
    id: 'r3-conflict-ar-cap-08',
    assertionIds: ['r3-original-ar-cap-08', 'r3-overlay-ar-cap-08'],
    stratum: 'design-lineage',
    derivation: { source: 'frozen-inventory-semantic-review', version: 'R2' },
  },
};

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('Inventory panel', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is no longer registered as a dedicated navigation destination', async () => {
    const { APP_ROUTES } = await import('../routes');
    const { WORKSPACE_NAVIGATION } = await import('../layouts/workspace-navigation');
    expect(APP_ROUTES.some((route) => route.id === 'intelligence-inventory')).toBe(false);
    expect(WORKSPACE_NAVIGATION.some((entry) => entry.id === 'intelligence-inventory')).toBe(false);
  });

  it('renders API-derived summary and all loaded rows', async () => {
    fetchMock.mockResolvedValueOnce(response({ summary, rows }));
    render(<Inventory />);

    expect(await screen.findByText('Inventory targets')).toBeInTheDocument();
    expect(screen.getByText('48 targets')).toBeInTheDocument();
    expect(screen.getByText('25 capabilities · 23 dependencies')).toBeInTheDocument();
    expect(screen.getByText('42 Represented')).toBeInTheDocument();
    expect(screen.getByText('6 Unresolved')).toBeInTheDocument();
    expect(screen.getByText('AR-CAP-01')).toBeInTheDocument();
    expect(screen.getByText('AR-CAP-08')).toBeInTheDocument();
    expect(screen.getByText('DEP-01')).toBeInTheDocument();
    expect(screen.getByText('Historical Inventory knowledge')).toBeInTheDocument();
  });

  it('supports category, status, and search filters', async () => {
    fetchMock.mockResolvedValueOnce(response({ summary, rows }));
    render(<Inventory />);
    await screen.findByText('Inventory targets');

    fireEvent.click(screen.getByRole('button', { name: 'Dependencies' }));
    expect(screen.getByText('DEP-01')).toBeInTheDocument();
    expect(screen.queryByText('AR-CAP-01')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Unresolved' }));
    expect(screen.getByText('AR-CAP-08')).toBeInTheDocument();
    expect(screen.queryByText('DEP-01')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[1]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Inventory' }), { target: { value: 'dependency' } });
    expect(screen.getByText('DEP-01')).toBeInTheDocument();
    expect(screen.queryByText('AR-CAP-01')).not.toBeInTheDocument();
  });

  it('shows filtered-empty separately from unavailable Inventory', async () => {
    fetchMock.mockResolvedValueOnce(response({ summary, rows }));
    render(<Inventory />);
    await screen.findByText('Inventory targets');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Inventory' }), { target: { value: 'no-match' } });
    expect(screen.getByText('No matching Inventory targets')).toBeInTheDocument();
    expect(screen.queryByText('Inventory unavailable')).not.toBeInTheDocument();
  });

  it('preserves list filters when returning from detail mode', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ summary, rows }))
      .mockResolvedValueOnce(response({ detail }));
    render(<Inventory />);
    await screen.findByText('Inventory targets');

    const search = screen.getByRole('searchbox', { name: 'Search Inventory' });
    fireEvent.change(search, { target: { value: 'AR-CAP-08' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect AR-CAP-08' }));
    expect(await screen.findByText('r3-original-ar-cap-08')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '← Back to Inventory' }));
    expect(screen.getByRole('searchbox', { name: 'Search Inventory' })).toHaveValue('AR-CAP-08');
    expect(screen.getByText('AR-CAP-08')).toBeInTheDocument();
    expect(screen.queryByText('AR-CAP-01')).not.toBeInTheDocument();
  });

  it('requests detail and renders assertions, historical links, unresolved state, and conflict without a winner', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ summary, rows }))
      .mockResolvedValueOnce(response({ detail }));
    render(<Inventory />);
    await screen.findByText('Inventory targets');

    fireEvent.click(screen.getByRole('button', { name: 'Inspect AR-CAP-08' }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/inventory/AR-CAP-08', expect.anything());
    expect(await screen.findByText('r3-original-ar-cap-08')).toBeInTheDocument();
    expect(screen.queryByText('Inventory targets')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Original artifact')).toBeInTheDocument();
    expect(screen.getByText('Semantic review overlay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unresolved question' })).toBeInTheDocument();
    expect(screen.getByText('No winner has been selected.')).toBeInTheDocument();
  });

  it('keeps the list visible when detail fails', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ summary, rows }))
      .mockResolvedValueOnce(response({ error: { message: 'Detail unavailable' } }, false, 503));
    render(<Inventory />);
    await screen.findByText('Inventory targets');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect AR-CAP-01' }));

    expect(await screen.findByText('Target detail unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to Inventory' })).toBeInTheDocument();
    expect(screen.queryByText('Inventory targets')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Inventory' }));
    expect(screen.getByText('Inventory targets')).toBeInTheDocument();
  });

  it('does not show zero counts while the projection is loading or after failure', async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<Inventory />);
    expect(screen.getByRole('status', { name: 'Loading Inventory' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    resolveFetch(response({ error: { message: 'Unavailable' } }, false, 503));
    await waitFor(() => expect(screen.getByText('Inventory unavailable')).toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens as an inspection Drawer without changing the current route', async () => {
    fetchMock.mockResolvedValueOnce(response({ summary, rows }));
    const onClose = vi.fn();
    const originalPath = window.location.pathname;
    render(<InventoryDrawer open onClose={onClose} />);

    expect(window.location.pathname).toBe(originalPath);
    expect(await screen.findByText('Inventory targets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
