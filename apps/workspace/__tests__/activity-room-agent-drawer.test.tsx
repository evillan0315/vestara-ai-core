import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryProvider } from '../src/contexts/TelemetryContext.js';
import { ThemeProvider } from '../src/lib/theme.js';
import ActivityRoomPage from '../src/pages/activity/ActivityRoomPage.js';
import type { ActivityRecord } from '../src/pages/activity/activity-types.js';

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSetActivitySelection: () => vi.fn(),
  useSurfaceContext: () => ({
    workspace: { id: 'ws-test', name: 'Test Workspace' },
    surface: { routeId: '/activity', path: '/activity', title: 'Activity', section: 'Main' },
    selected: undefined,
  }),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const developerMessage: ActivityRecord = {
  id: 'activity:evt-2:agent-message',
  sequence: 2,
  timestamp: '2026-08-06T12:00:01.000Z',
  actor: { type: 'agent', id: 'developer', displayName: 'developer', role: 'agent' },
  kind: 'agent-message',
  agentId: 'developer',
  messageKind: 'message',
  content: 'Fixed the failing check',
  evidenceRefs: [],
};

const REGISTERED_AGENTS = [
  {
    id: 'agent-developer',
    name: 'Developer',
    role: 'developer',
    agentType: 'workspace',
    description: 'Implements approved tasks.',
    status: 'active',
    provider: 'opencode',
    model: 'deepseek-v4-flash-free',
    runtimeAgent: 'vestara-developer',
  },
];

const CONFIG_PROVIDERS = [
  {
    id: 'opencode',
    name: 'OpenCode',
    models: [
      { id: 'deepseek-v4-flash-free', name: 'deepseek-v4-flash-free' },
      { id: 'nemotron-3-ultra-free', name: 'nemotron-3-ultra-free' },
    ],
  },
];
const RUNTIME_AGENTS = [
  { name: 'vestara-developer', description: 'Implement approved tasks' },
  { name: 'vestara-planner' },
];

function configProvidersRes(url: string) {
  const q = new URL(url, 'http://localhost').searchParams.get('q')?.toLowerCase() ?? '';
  const providers = (
    q
      ? CONFIG_PROVIDERS.map((p) => ({
          ...p,
          models: p.models.filter(
            (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
          ),
        })).filter((p) => p.models.length > 0)
      : CONFIG_PROVIDERS
  );
  const total = providers.reduce((n, p) => n + p.models.length, 0);
  return jsonRes({ providers, default: {}, pagination: { total, offset: 0, limit: 50, hasMore: false } });
}

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

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
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
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/opencode/config/providers')) return configProvidersRes(url);
    if (url.includes('/api/opencode/agents')) return jsonRes({ agents: RUNTIME_AGENTS });
    if (url.includes('/api/agents')) return jsonRes({ agents: REGISTERED_AGENTS });
    return jsonRes({
      records: [developerMessage],
      firstSequence: 1,
      lastSequence: 2,
      nextSequence: 3,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Activity Room agent detail drawer', () => {
  it('opens a detailed drawer when an agent is clicked and shows live context', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Fixed the failing check')).toBeTruthy());

    fireEvent.click(screen.getByText('Developer'));

    const drawer = await screen.findByRole('dialog');
    expect(drawer).toBeTruthy();
    // The registered agent resolves by role, so the shared selector shows the configured binding.
    const trigger = await within(drawer).findByTestId('provider-model-selector-trigger');
    await waitFor(() => expect(trigger.textContent).toContain('deepseek-v4-flash-free'));
    expect(trigger.textContent).toContain('OpenCode');
    // The native runtime agent twin is populated from the stored agent config.
    expect(within(drawer).getByDisplayValue('vestara-developer — Implement approved tasks')).toBeTruthy();
  });

  it('edits provider/model in the drawer and saves through the agent registry API', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Fixed the failing check')).toBeTruthy());

    fireEvent.click(screen.getByText('Developer'));

    const drawer = await screen.findByRole('dialog');
    const trigger = await within(drawer).findByTestId('provider-model-selector-trigger');
    await waitFor(() => expect(trigger.textContent).toContain('deepseek-v4-flash-free'));

    fireEvent.click(trigger);
    const option = await within(drawer).findByRole('option', { name: /nemotron-3-ultra-free/ });
    fireEvent.click(option);
    await waitFor(() => expect(trigger.textContent).toContain('nemotron-3-ultra-free'));

    fireEvent.click(within(drawer).getByRole('button', { name: 'Save provider / model' }));

    await waitFor(() => expect(within(drawer).getByText('Saved')).toBeTruthy());

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const putCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[1]?.method).toUpperCase() === 'PUT');
    expect(putCall).toBeTruthy();
    expect(String(putCall![0])).toContain('/api/agents/agent-developer');
    const body = JSON.parse(String(putCall![1]?.body)) as { model?: string };
    expect(body.model).toBe('nemotron-3-ultra-free');
  });

  it('closes the drawer from the close button', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Fixed the failing check')).toBeTruthy());

    fireEvent.click(screen.getByText('Developer'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toBeTruthy();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
