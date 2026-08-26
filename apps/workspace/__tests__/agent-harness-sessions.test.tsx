import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentHarnessSessions from '../src/pages/Agents/AgentHarnessSessions.js';
import type { HarnessSessionEntry } from '../src/pages/Agents/types.js';

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

function session(overrides: Partial<HarnessSessionEntry> = {}): HarnessSessionEntry {
  return {
    id: 's1',
    workflowId: 'thread:t1',
    goal: 'Ship the feature',
    status: 'running',
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  };
}

function makeFetch() {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/workflow/')) {
      return json({
        projection: {
          threadId: 't1',
          status: 'running',
          stages: [],
          approvals: [],
          agents: [],
          metrics: { elapsedMs: 1000, stagesCompleted: 0, additions: 0, deletions: 0 },
        },
      });
    }
    if (u.includes('/items')) return json({ items: [], turns: [] });
    if (u.includes('/events')) return json({ events: [] });
    return json({});
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentHarnessSessions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch());
  });

  it('renders nothing when there are no harness sessions', () => {
    const { container } = render(<AgentHarnessSessions sessions={[]} onLoad={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the session list with goals and statuses', () => {
    render(<AgentHarnessSessions sessions={[session()]} onLoad={() => {}} />);
    expect(screen.getByText('Harness Sessions (1)')).toBeTruthy();
    expect(screen.getByText('Ship the feature')).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
  });

  it('expands a session and loads its workflow projection', async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<AgentHarnessSessions sessions={[session()]} onLoad={() => {}} />);
    fireEvent.click(screen.getByText('Ship the feature'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/workflow/t1'), expect.any(Object)),
    );
    await waitFor(() => expect(screen.getByText(/0\/0 stages/)).toBeTruthy());
  });
});
