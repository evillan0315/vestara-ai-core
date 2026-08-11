import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import EvidencePage from '../src/pages/Evidence.js';

const CANDIDATE = 'c'.repeat(64);
const APPROVED = 'a'.repeat(64);

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function fetchMock(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.includes('/baselines/') && init?.method === 'POST') {
    const status = url.includes('/approve') ? 'approved' : 'rejected';
    return Promise.resolve(jsonResponse({ baseline: { status } }));
  }
  if (url === '/api/evidence/baselines') {
    return Promise.resolve(
      jsonResponse({
        baselines: [
          {
            scenarioKey: '/dashboard@1280x800@dark',
            artifactDigest: '',
            status: 'missing',
            candidateDigest: CANDIDATE,
          },
          {
            scenarioKey: '/evidence@1280x800@dark',
            artifactDigest: APPROVED,
            status: 'approved',
            approvedBy: 'human-reviewer',
            approvedAt: '2026-08-03T00:00:00.000Z',
          },
        ],
      }),
    );
  }
  if (url.startsWith('/api/evidence/bundles')) {
    return Promise.resolve(jsonResponse({ bundles: [] }));
  }
  return Promise.resolve(jsonResponse({}));
}

describe('evidence baseline review', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fetchMock));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderPage() {
    return render(
      <ThemeProvider>
        <EvidencePage />
      </ThemeProvider>,
    );
  }

  it('lists baseline candidates with their governance status', async () => {
    renderPage();
    expect(await screen.findByText('Visual Baselines')).toBeTruthy();
    expect(await screen.findByText('missing')).toBeTruthy();
    expect(screen.getByText('approved')).toBeTruthy();
    expect(screen.getByText('/dashboard@1280x800@dark')).toBeTruthy();
    expect(screen.getByText('/evidence@1280x800@dark')).toBeTruthy();
  });

  it('renders the candidate screenshot from the artifact store', async () => {
    renderPage();
    const image = await screen.findByAltText('candidate /dashboard@1280x800@dark');
    expect(image.getAttribute('src')).toContain(`/api/evidence/artifacts/${CANDIDATE}`);
  });

  it('approves a candidate through the governance endpoint', async () => {
    renderPage();
    const approve = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/evidence/baselines/${encodeURIComponent('/dashboard@1280x800@dark')}/approve`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('rejects a candidate through the governance endpoint', async () => {
    renderPage();
    const reject = await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(reject);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/evidence/baselines/${encodeURIComponent('/dashboard@1280x800@dark')}/reject`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
