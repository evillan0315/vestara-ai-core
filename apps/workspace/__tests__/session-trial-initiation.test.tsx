import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionView from '../src/pages/Sessions/SessionView.js';

const WORKFLOWS = [
  { id: 'feature', label: 'Feature Development', steps: 4 },
  { id: 'analyze', label: 'Repository Analysis', steps: 3 },
];

function json(value: unknown, ok = true): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok, status: ok ? 200 : 400, json: async () => value };
}

function renderSession() {
  return render(
    <MemoryRouter initialEntries={['/sessions/s1']}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionView />} />
      </Routes>
    </MemoryRouter>,
  );
}

let startFails = false;

beforeEach(() => {
  startFails = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/sessions/executions/start')) {
        return startFails ? json({ error: 'boom' }, false) : json({ session: { id: 'exs-new' } });
      }
      if (u.includes('/api/workflows')) return json({ workflows: WORKFLOWS });
      if (u.includes('/api/sessions/executions')) {
        return json({ sessions: [{ id: 's1', goal: 'Build the scheduler', status: 'running', createdAt: Date.now(), timeline: [] }] });
      }
      if (u.includes('/api/agents')) return json({ agents: [] });
      if (u.includes('/api/approvals')) return json({ approvals: [] });
      return json({ session: { title: 'Session 1' } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Session workflow creation', () => {
  it('creates a new workflow from the session and navigates to it', async () => {
    renderSession();

    expect(await screen.findByText('Start a New Workflow')).toBeTruthy();
    expect(screen.getByText('Feature Development · 4 step(s)')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Add billing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const start = calls.find(([u]) => String(u).includes('/api/sessions/executions/start'));
      expect(start).toBeTruthy();
      const body = JSON.parse(String(start?.[1]?.body)) as { goal: string; workflow: string };
      expect(body).toEqual({ goal: 'Add billing', workflow: 'feature' });
    });
  });

  it('reports a controlled error when the workflow cannot start', async () => {
    startFails = true;
    renderSession();
    expect(await screen.findByText('Start a New Workflow')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(await screen.findByText(/Workflow start failed \(400\)/)).toBeTruthy();
  });
});
