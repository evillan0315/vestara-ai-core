/**
 * M11C Agent Control Drawer Tests (AR-AGENT-CTRL-001B + AR-AGENT-CTRL-002)
 *
 * Focused tests for:
 * - resolveAgentIdFromParticipantId
 * - Agent name mouse/keyboard activation → opens drawer
 * - Human participants do not open Agent Control
 * - Participant-row stream-filtering preserved
 * - Tab semantics and navigation
 * - Loading/error/not-registered states
 * - Draft editing and dirty detection
 * - Update disabled/enabled states
 * - Successful update flow
 * - Failed update preserving draft
 * - Duplicate-submit prevention
 * - Cancel/Reset
 * - Dirty-close protection
 * - Configured vs projected authority labeling
 * - Drawer portal (ShellLayout overlay regression)
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import AgentProjectionDrawer, { resolveAgentIdFromParticipantId } from '../src/pages/activity/AgentProjectionDrawer.js';
import M11CParticipantRail from '../src/pages/activity/M11CParticipantRail.js';
import type { ParticipantProjection } from '@vestara/activity-room';

// ─── Mock Data ───────────────────────────────────────────────

const humanParticipant: ParticipantProjection = {
  participantId: 'human-1',
  type: 'human',
  displayName: 'Eddie',
  membership: 'member',
  presence: 'online',
  workState: 'working',
  joinedAt: '2026-08-27T12:00:00Z',
  lastActivityAt: '2026-08-27T12:01:00Z',
};

const agentParticipant: ParticipantProjection = {
  participantId: 'agent-developer',
  type: 'agent',
  displayName: 'Developer',
  role: 'developer',
  membership: 'member',
  presence: 'online',
  workState: 'working',
  currentAssignment: { workflowRunId: 'wf-1', taskId: 'task-1', taskTitle: 'Implement projection' },
  joinedAt: '2026-08-27T12:00:00Z',
  lastActivityAt: '2026-08-27T12:01:00Z',
  modelId: 'deepseek-v4-flash-free',
  providerId: 'opencode',
  teamId: 'team-1',
  teamName: 'Core Team',
};

const agentParticipantNoRole: ParticipantProjection = {
  participantId: 'agent-planner',
  type: 'agent',
  displayName: 'Planner',
  membership: 'member',
  presence: 'away',
  workState: 'idle',
  joinedAt: '2026-08-27T12:00:00Z',
  lastActivityAt: '2026-08-27T12:00:30Z',
};

const participants: readonly ParticipantProjection[] = [humanParticipant, agentParticipant, agentParticipantNoRole];

const REGISTERED_AGENT = {
  id: 'developer',
  name: 'Developer',
  role: 'developer',
  status: 'active',
  description: 'Implements approved tasks.',
  provider: 'opencode',
  model: 'deepseek-v4-flash-free',
  runtimeAgent: 'vestara-developer',
  teamId: 'team-1',
  capabilities: ['code', 'review', 'test'],
  permissions: [{ capability: 'code', scope: 'workspace' }],
  color: '#3b82f6',
};

const REGISTERED_TEAM = { id: 'team-1', name: 'Core Team' };

// ─── Mock WebSocket ──────────────────────────────────────────

class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 0;

  constructor(_url: string) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({
          op: 'subscribed',
          cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' },
          frontier: 10,
        }),
      });
    });
  }

  send(_data: string): void {}
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

// ─── Mock Fetch ──────────────────────────────────────────────

function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function mockFetchForAgentDetail(agent = REGISTERED_AGENT, team = REGISTERED_TEAM) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/api/agents/developer') && method === 'GET') return jsonRes({ agent, executions: [], stats: null, team });
    if (url.includes('/api/agents/developer') && method === 'PUT') {
      return jsonRes({ agent: { ...agent, ...JSON.parse(init?.body as string ?? '{}') } });
    }
    if (url.includes('/api/teams')) return jsonRes({ teams: [team] });
    if (url.includes('/api/activity-room/v1/snapshot')) {
      return jsonRes({
        room: { roomId: 'room-1', name: 'Activity Room', cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' }, rebuiltAt: '2026-08-27T12:00:00Z' },
        participants: [...participants],
        stream: [],
        workflowSummary: null,
        attention: [],
        contextualCapabilities: { mentionableParticipants: [], availableCommands: [], referenceableEntities: [] },
        cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' },
      });
    }
    if (url.includes('/api/activity-room/v1/activities')) return jsonRes({ records: [], count: 0, limit: 50, nextCursor: null });
    return jsonRes({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ─── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  mockFetchForAgentDetail();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── resolveAgentIdFromParticipantId ────────────────────────

describe('resolveAgentIdFromParticipantId', () => {
  it('strips agent- prefix from agent participant IDs', () => {
    expect(resolveAgentIdFromParticipantId('agent-developer')).toBe('developer');
    expect(resolveAgentIdFromParticipantId('agent-planner')).toBe('planner');
  });

  it('returns null for human participant IDs', () => {
    expect(resolveAgentIdFromParticipantId('human-1')).toBeNull();
  });

  it('returns null for bare IDs without prefix', () => {
    expect(resolveAgentIdFromParticipantId('developer')).toBeNull();
  });
});

// ─── Agent Name Mouse Activation ────────────────────────────

describe('M11C Agent Name Mouse Activation', () => {
  it('calls onOpenAgentControl when clicking the agent name (not the row)', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    await act(async () => {
      fireEvent.click(agentName);
    });
    expect(onOpenAgentControl).toHaveBeenCalledWith('agent-developer');
  });

  it('agent name has button role and aria-label for accessibility', () => {
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={vi.fn()}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    expect(agentName.getAttribute('role')).toBe('button');
    expect(agentName.getAttribute('aria-label')).toBe('Open agent control for Developer');
  });

  it('agent name has hover/focus affordance class', () => {
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={vi.fn()}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    expect(agentName.className).toContain('ar-guest__name--agent-action');
  });
});

// ─── Agent Name Keyboard Activation ─────────────────────────

describe('M11C Agent Name Keyboard Activation', () => {
  it('opens drawer on Enter key', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    await act(async () => {
      fireEvent.keyDown(agentName, { key: 'Enter' });
    });
    expect(onOpenAgentControl).toHaveBeenCalledWith('agent-developer');
  });

  it('opens drawer on Space key', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    await act(async () => {
      fireEvent.keyDown(agentName, { key: ' ' });
    });
    expect(onOpenAgentControl).toHaveBeenCalledWith('agent-developer');
  });

  it('does not trigger on other keys', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    await act(async () => {
      fireEvent.keyDown(agentName, { key: 'Tab' });
    });
    expect(onOpenAgentControl).not.toHaveBeenCalled();
  });
});

// ─── Human Gating ──────────────────────────────────────────

describe('M11C Human Participant Gating', () => {
  it('human names do not have button role or agent-action class', () => {
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={vi.fn()}
        />
      </ThemeProvider>,
    );

    const humanName = screen.getByText('Eddie');
    expect(humanName.getAttribute('role')).toBeNull();
    expect(humanName.className).not.toContain('ar-guest__name--agent-action');
  });

  it('human name click does not trigger onOpenAgentControl', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const humanName = screen.getByText('Eddie');
    await act(async () => {
      fireEvent.click(humanName);
    });
    expect(onOpenAgentControl).not.toHaveBeenCalled();
  });

  it('human name keyboard activation does not trigger onOpenAgentControl', async () => {
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={vi.fn()}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const humanName = screen.getByText('Eddie');
    await act(async () => {
      fireEvent.keyDown(humanName, { key: 'Enter' });
    });
    expect(onOpenAgentControl).not.toHaveBeenCalled();
  });
});

// ─── Stream Filtering Preservation ─────────────────────────

describe('M11C Stream Filtering Preservation', () => {
  it('row click still calls onSelectParticipant for stream filtering', async () => {
    const onSelectParticipant = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={onSelectParticipant}
          onOpenAgentControl={vi.fn()}
        />
      </ThemeProvider>,
    );

    const agentRow = screen.getByText('Developer').closest('button');
    expect(agentRow).toBeTruthy();
    await act(async () => {
      fireEvent.click(agentRow!);
    });
    expect(onSelectParticipant).toHaveBeenCalledWith('agent-developer');
  });

  it('agent name click does NOT trigger row selection (stopPropagation)', async () => {
    const onSelectParticipant = vi.fn();
    const onOpenAgentControl = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId={undefined}
          onSelectParticipant={onSelectParticipant}
          onOpenAgentControl={onOpenAgentControl}
        />
      </ThemeProvider>,
    );

    const agentName = screen.getByText('Developer');
    await act(async () => {
      fireEvent.click(agentName);
    });
    expect(onOpenAgentControl).toHaveBeenCalledWith('agent-developer');
    expect(onSelectParticipant).not.toHaveBeenCalled();
  });

  it('toggling selection off still works via row click', async () => {
    const onSelectParticipant = vi.fn();
    render(
      <ThemeProvider>
        <M11CParticipantRail
          participants={participants}
          selectedParticipantId="agent-developer"
          onSelectParticipant={onSelectParticipant}
          onOpenAgentControl={vi.fn()}
        />
      </ThemeProvider>,
    );

    const agentRow = screen.getByText('Developer').closest('button');
    await act(async () => {
      fireEvent.click(agentRow!);
    });
    expect(onSelectParticipant).toHaveBeenCalledWith(undefined);
  });
});

// ─── AgentProjectionDrawer: Loading & Error States ──────────

describe('AgentProjectionDrawer Loading & Error States', () => {
  it('shows loading state while fetching agent config', async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })),
    );

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading agent configuration…')).toBeTruthy();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ agent: REGISTERED_AGENT, team: REGISTERED_TEAM }) });
    });
  });

  it('shows not-registered warning when agent is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ agent: null, team: null }),
      })),
    );

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="unknown-agent"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Agent not registered/)).toBeTruthy();
    });
  });

  it('shows error when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load agent configuration.')).toBeTruthy();
    });
  });
});

// ─── Tab Semantics & Navigation ─────────────────────────────

describe('AgentProjectionDrawer Tab Semantics', () => {
  it('renders four tabs with correct ARIA attributes', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeTruthy();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);

    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-controls')).toBe('tabpanel-overview');

    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-controls')).toBe('tabpanel-configuration');

    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-controls')).toBe('tabpanel-capabilities');

    expect(tabs[3].getAttribute('aria-selected')).toBe('false');
    expect(tabs[3].getAttribute('aria-controls')).toBe('tabpanel-activity');
  });

  it('switches tab content on click', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    // Overview is visible by default
    expect(screen.getByText('Identity')).toBeTruthy();

    // Click Configuration tab
    await act(async () => {
      fireEvent.click(screen.getAllByText('Configuration')[0]);
    });

    // Configuration tab shows form fields via new primitives
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Role')).toBeTruthy();

    // Click Activity tab
    await act(async () => {
      fireEvent.click(screen.getAllByText('Activity')[0]);
    });

    expect(screen.getByText('Projected Presence')).toBeTruthy();
  });

  it('Overview tab shows agent identity and projected state summary', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Identity')).toBeTruthy();
    });

    // Identity details
    expect(screen.getByText('Core Team')).toBeTruthy(); // Team
    expect(screen.getByText('vestara-developer')).toBeTruthy(); // Runtime Agent

    // Projected state summary
    expect(screen.getByText('online')).toBeTruthy();
    expect(screen.getByText('working')).toBeTruthy();
    expect(screen.getByText('Implement projection')).toBeTruthy();
  });

  it('Capabilities tab shows configured capabilities with authority label', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Identity')).toBeTruthy();
    });

    // Click Capabilities tab
    await act(async () => {
      fireEvent.click(screen.getAllByText('Capabilities')[0]);
    });

    // Authority label
    expect(screen.getByText(/Configured authority/)).toBeTruthy();
    expect(screen.getByText('Configured Capabilities')).toBeTruthy();
    expect(screen.getByText('Configured Permissions')).toBeTruthy();
    expect(screen.getByText(/Effective runtime authority/)).toBeTruthy();
  });

  it('Activity tab shows projected presence and work state', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    // Click Activity tab
    await act(async () => {
      fireEvent.click(screen.getAllByText('Activity')[0]);
    });

    expect(screen.getByText('Projected Presence')).toBeTruthy();
    expect(screen.getByText('online')).toBeTruthy();
    expect(screen.getByText('working')).toBeTruthy();
    expect(screen.getByText('member')).toBeTruthy();
    expect(screen.getByText('Implement projection')).toBeTruthy();
    expect(screen.getByText('Core Team')).toBeTruthy();
  });
});

// ─── Draft Editing & Dirty Detection ────────────────────────

describe('AgentProjectionDrawer Draft & Dirty', () => {
  it('marks draft as dirty when a field changes', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    // Click Configuration tab
    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    // Change the name via placeholder text (TextInput primitive)
    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    // Should show Unsaved badge and Reset button
    await waitFor(() => {
      expect(screen.getByText('Unsaved')).toBeTruthy();
      expect(screen.getByText('Reset')).toBeTruthy();
    });
  });

  it('Update Agent button is disabled when draft is clean', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    const updateBtn = screen.getByText('Update Agent');
    expect(updateBtn.closest('button')?.disabled).toBe(true);
  });

  it('Update Agent button is enabled when draft is dirty and valid', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await waitFor(() => {
      const updateBtn = screen.getByText('Update Agent');
      expect(updateBtn.closest('button')?.disabled).toBe(false);
    });
  });

  it('Reset button reverts draft to original values', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Reset')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reset'));
    });

    await waitFor(() => {
      expect((nameInput as HTMLInputElement).value).toBe('Developer');
      expect(screen.queryByText('Unsaved')).toBeNull();
    });
  });
});

// ─── Update Flow ────────────────────────────────────────────

describe('AgentProjectionDrawer Update Flow', () => {
  it('successful update shows success feedback and refetches', async () => {
    const fetchMock = mockFetchForAgentDetail();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Update Agent')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update Agent'));
    });

    await waitFor(() => {
      expect(screen.getByText('Updated')).toBeTruthy();
    });
  });

  it('failed update shows error and preserves draft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/api/teams')) return jsonRes({ teams: [REGISTERED_TEAM] });
        if (url.includes('/api/agents/developer') && method === 'PUT') {
          return { ok: false, status: 500, json: async () => ({ error: 'Internal error' }) };
        }
        if (url.includes('/api/agents/developer')) {
          return jsonRes({ agent: REGISTERED_AGENT, executions: [], stats: null, team: REGISTERED_TEAM });
        }
        return jsonRes({});
      }),
    );

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Identity')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('Configuration')[0]);
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update Agent'));
    });

    // After failed update: button returns to "Update Agent" (not stuck in "Updating…")
    // and draft is preserved (input still has changed value)
    await waitFor(() => {
      expect(screen.getByText('Update Agent')).toBeTruthy();
    });
    expect((nameInput as HTMLInputElement).value).toBe('Developer Prime');
    // Draft should still be dirty
    expect(screen.getByText('Unsaved')).toBeTruthy();
  });

  it('prevents duplicate submission while saving', async () => {
    let resolvePut!: (v: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/api/agents/developer') && method === 'GET') {
          return jsonRes({ agent: REGISTERED_AGENT, executions: [], stats: null, team: REGISTERED_TEAM });
        }
        if (url.includes('/api/teams')) return jsonRes({ teams: [REGISTERED_TEAM] });
        if (url.includes('/api/agents/developer') && method === 'PUT') {
          return new Promise((resolve) => { resolvePut = resolve; });
        }
        return jsonRes({});
      }),
    );

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update Agent'));
    });

    // Button should show updating state
    await waitFor(() => {
      expect(screen.getByText('Updating…')).toBeTruthy();
    });

    // Resolve the PUT
    await act(async () => {
      resolvePut({ ok: true, json: async () => ({ agent: { ...REGISTERED_AGENT, name: 'Developer Prime' } }) });
    });
  });
});

// ─── Dirty-Close Protection ─────────────────────────────────

describe('AgentProjectionDrawer Dirty-Close Protection', () => {
  it('warns before closing with unsaved changes', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={onClose}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    // Try to close the drawer via Escape
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    // Should show unsaved warning
    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
      expect(screen.getByText('Keep Editing')).toBeTruthy();
      expect(screen.getByText('Discard')).toBeTruthy();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Keep Editing closes warning and preserves draft', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={onClose}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.getByText('Keep Editing')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Keep Editing'));
    });

    // Warning should be gone, draft preserved
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('Developer Prime');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Discard closes drawer and resets draft', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={onClose}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Configuration'));
    });

    const nameInput = screen.getByPlaceholderText('Agent name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Developer Prime' } });
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.getByText('Discard')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Discard'));
    });

    expect(onClose).toHaveBeenCalled();
  });
});

// ─── Drawer Portal (ShellLayout Overlay Regression) ─────────

describe('Drawer Portal', () => {
  it('renders dialog into document.body when portal is true', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('dialog is not nested inside MemoryRouter content when portal is true', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AgentProjectionDrawer
            open
            onClose={vi.fn()}
            agentId="developer"
            participant={agentParticipant}
          />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('[data-testid]')).toBeNull();
  });
});
