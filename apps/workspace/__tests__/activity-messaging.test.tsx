import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

const workflowRecord: ActivityRecord = {
  id: 'activity:evt-1:workflow',
  sequence: 1,
  timestamp: '2026-08-06T12:00:00.000Z',
  actor: { type: 'system', id: 'workflow-orchestrator', displayName: 'workflow-orchestrator', role: 'system' },
  kind: 'workflow',
  workflowId: 'wfo-1',
  previousState: 'draft',
  currentState: 'executing',
  reason: 'project phase changed',
  authoritative: true,
  observed: false,
  evidenceRefs: [],
};

const engineerMessage: ActivityRecord = {
  id: 'activity:evt-2:agent-message',
  sequence: 2,
  timestamp: '2026-08-06T12:00:01.000Z',
  actor: { type: 'agent', id: 'engineer', displayName: 'engineer', role: 'agent' },
  kind: 'agent-message',
  agentId: 'engineer',
  messageKind: 'message',
  content: 'Fixed the failing check',
  evidenceRefs: [],
};

class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(_url: string) {
    queueMicrotask(() => this.onopen?.());
  }
  send(_data: string): void {}
  close(): void {
    this.onclose?.();
  }
}

let fetchImpl: ReturnType<typeof vi.fn> | undefined;

function serverRecord(payload: {
  content: string;
  referencedActivityIds?: string[];
  effect?: string;
  correctionOf?: string;
}): ActivityRecord {
  return {
    id: 'activity:msg:server-1',
    sequence: 3,
    timestamp: '2026-08-06T12:00:03.000Z',
    actor: { type: 'human', id: 'current-user', displayName: 'You' },
    kind: 'agent-message',
    agentId: 'all-agents',
    messageKind: 'message',
    content: payload.content,
    evidenceRefs: [],
    ...(payload.referencedActivityIds !== undefined ? { referencedActivityIds: payload.referencedActivityIds } : {}),
    ...(payload.effect !== undefined ? { effect: payload.effect as ActivityRecord['effect'] } : {}),
    ...(payload.correctionOf !== undefined ? { correctionOf: payload.correctionOf } : {}),
  };
}

function renderRoom() {
  return render(
    <ThemeProvider>
      <TelemetryProvider>
        <ActivityRoomPage />
      </TelemetryProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST' && url === '/api/messages') {
      const body = JSON.parse(String(init.body)) as {
        content: string;
        referencedActivityIds?: string[];
        effect?: string;
        correctionOf?: string;
      };
      return {
        ok: true,
        json: async () => ({ record: serverRecord(body) }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        records: [workflowRecord, engineerMessage],
        firstSequence: 1,
        lastSequence: 2,
        nextSequence: 3,
      }),
    };
  });
  vi.stubGlobal('fetch', fetchImpl);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Activity messaging (AAR-001E)', () => {
  it('optimistically shows a sent message and replaces it with the server record', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    const textarea = screen.getByLabelText('Message composer');
    fireEvent.change(textarea, { target: { value: 'Hello agents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // Optimistic human message appears immediately.
    expect(screen.getByText('Hello agents')).toBeTruthy();
    expect(screen.getAllByText('Sending…').length).toBeGreaterThan(0);

    // The POST was made with the all-agents target.
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"type":"all-agents"'),
        }),
      ),
    );

    // The optimistic temp record is replaced by the server record: exactly one
    // copy of the message remains and the sending state clears.
    await waitFor(() => expect(screen.getAllByText('Hello agents')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
    expect(screen.getByText(/Sequence 3 · 3 records/)).toBeTruthy();
  });

  it('sends to the selected agent and mentions open a target menu', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    // Select the engineer in the sidebar, then the composer targets them.
    fireEvent.click(screen.getByText('Engineer'));
    expect(screen.getByText(/To engineer/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Message composer'), { target: { value: 'Direct question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({ body: expect.stringContaining('"agentId":"engineer"') }),
      ),
    );

    // Mentions: typing @ opens the menu and choosing an agent retargets.
    fireEvent.change(screen.getByLabelText('Message composer'), { target: { value: 'Hey @' } });
    await waitFor(() => expect(screen.getByRole('listbox', { name: 'Mention agents' })).toBeTruthy());
    fireEvent.click(screen.getByRole('option', { name: /Planner/ }));
    expect(screen.getByText(/To planner/)).toBeTruthy();
  });

  it('attaches a referenced activity to the message', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Reference Workflow activity' }));
    expect(screen.getByText(/Referencing:/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Message composer'), { target: { value: 'About that change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          body: expect.stringContaining('"referencedActivityIds":["activity:evt-1:workflow"]'),
        }),
      ),
    );
  });

  it('shows a failed send with a retry affordance', async () => {
    fetchImpl?.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url === '/api/messages') {
        return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
      }
      return {
        ok: true,
        json: async () => ({
          records: [workflowRecord, engineerMessage],
          firstSequence: 1,
          lastSequence: 2,
          nextSequence: 3,
        }),
      };
    });

    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Message composer'), { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByText('Failed to send.')).toBeTruthy());
    expect(screen.getByText('Message failed to send.')).toBeTruthy();
  });

  it('sends an organizational effect and renders it as a badge on the message', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Message effect'), { target: { value: 'authorization' } });
    fireEvent.change(screen.getByLabelText('Message composer'), { target: { value: 'Authorize continuation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // The optimistic message carries the effect and renders the badge.
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({ body: expect.stringContaining('"effect":"authorization"') }),
      ),
    );
    // Badge on the message (the composer's effect <option> also contains the word).
    await waitFor(() => expect(screen.getAllByText('Authorization').length).toBeGreaterThan(0));
  });

  it('records an append-only correction and marks the original', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Correct Workflow activity' }));
    expect(screen.getByRole('dialog', { name: 'Correct attribution' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Corrected actor'), { target: { value: 'Reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record correction' }));

    // The correction is appended, linked to the original, with intervention effect.
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          body: expect.stringContaining('"correctionOf":"activity:evt-1:workflow"'),
        }),
      ),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/messages',
      expect.objectContaining({ body: expect.stringContaining('"effect":"intervention"') }),
    );

    // The original is marked corrected; the original is never removed.
    await waitFor(() => expect(screen.getByText(/Corrected by/)).toBeTruthy());
    expect(screen.getByText('project phase changed')).toBeTruthy();
  });
});
