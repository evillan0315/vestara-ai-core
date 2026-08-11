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
  evidenceRefs: ['evidence:report-42'],
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

const verificationRecord: ActivityRecord = {
  id: 'activity:evt-3:verification',
  sequence: 3,
  timestamp: '2026-08-06T12:00:02.000Z',
  actor: { type: 'system', id: 'verifier', displayName: 'verifier', role: 'verifier' },
  kind: 'verification',
  verificationRunId: 'vr-9',
  taskId: 'task-7',
  outcome: 'failed',
  confidence: 0.82,
  checks: [
    { name: 'build', status: 'passed' },
    { name: 'lint', status: 'failed', summary: 'unused variable' },
  ],
  reason: 'lint failure',
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        records: [workflowRecord, engineerMessage, verificationRecord],
        firstSequence: 1,
        lastSequence: 3,
        nextSequence: 4,
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Activity detail modal (AAR-001D)', () => {
  it('opens a workflow record and shows its structured fields', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Workflow activity' }));

    const dialog = screen.getByRole('dialog', { name: 'Workflow activity details' });
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Previous state')).toBeTruthy();
    expect(screen.getByText('Current state')).toBeTruthy();
    expect(screen.getAllByText('executing').length).toBeGreaterThan(0);
    expect(screen.getByText('Authoritative')).toBeTruthy();
    expect(screen.getByText('yes')).toBeTruthy();
  });

  it('renders evidence references and the raw payload toggle', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Workflow activity' }));
    expect(screen.getByText('Evidence references')).toBeTruthy();
    expect(screen.getByText('evidence:report-42')).toBeTruthy();

    fireEvent.click(screen.getByText('Raw payload'));
    await waitFor(() => expect(screen.getByText(/"id": "activity:evt-1:workflow"/)).toBeTruthy());
  });

  it('renders verification checks in structured form', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Verification activity' }));
    expect(screen.getByText('Verification checks')).toBeTruthy();
    expect(screen.getByText('build')).toBeTruthy();
    expect(screen.getByText('lint')).toBeTruthy();
    expect(screen.getByText('unused variable')).toBeTruthy();
    expect(screen.getByText('0.82')).toBeTruthy();
  });

  it('closes via the close button and via Escape', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('project phase changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Workflow activity' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Workflow activity' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
