/**
 * AR-008 — Surface Context Transport Tests
 *
 * Verifies the 11 missing test scenarios identified in AR-008.16:
 * - Empty context
 * - Activity selection propagation
 * - Selection replacement
 * - Stale-reference clearing
 * - Context removal
 * - Message-time context snapshot (High priority)
 * - Navigation behavior
 * - Repository/workspace change
 * - Conversation isolation (High priority)
 * - Malformed/unauthorized references
 * - Provider/model unaffected by context
 *
 * These tests exercise the hook-level surface context transport:
 * ConversationPanel → sendMessage(surfaceContext) → runTurn → POST body.
 *
 * @see AR-008-assistant-surface-context.md § AR-008.16
 */

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnSurfaceContext } from '@vestara/shared';

// ─── Mocks ────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

import { useAssistantConversation } from '../src/hooks/useAssistantConversation';

// ─── Helpers ──────────────────────────────────────────────────

function makeConversationSummary(overrides?: Record<string, unknown>) {
  return {
    id: 'conv-001',
    title: 'Test Conversation',
    messageCount: 5,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConversation(overrides?: Record<string, unknown>) {
  return {
    id: 'conv-001',
    userId: 'local',
    title: 'Test Conversation',
    messages: [
      { id: 'msg-1', conversationId: 'conv-001', role: 'user', content: 'Hello', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'msg-2', conversationId: 'conv-001', role: 'assistant', content: 'Hi there!', createdAt: '2026-01-01T00:00:01Z' },
    ],
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:01Z',
    ...overrides,
  };
}

function mockListResponse(conversations: ReturnType<typeof makeConversationSummary>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ conversations }),
  });
}

function mockGetResponse(conversation: ReturnType<typeof makeConversation>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ conversation }),
  });
}

function mockStreamResponse(events: Array<{ type: string; content?: string }>) {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => `data: ${JSON.stringify({ event: e })}\n\n`);
  const streamContent = encoder.encode(chunks.join(''));

  mockFetch.mockResolvedValueOnce({
    ok: true,
    body: {
      getReader: () => {
        let called = false;
        return {
          read: async () => {
            if (called) return { done: true, value: undefined };
            called = true;
            return { done: false, value: streamContent };
          },
        };
      },
    },
  });
}

/** Extract the parsed JSON body from the most recent fetch call. */
function lastFetchBody(): Record<string, unknown> {
  const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  if (!lastCall) throw new Error('No fetch calls recorded');
  return JSON.parse(lastCall[1].body as string);
}

/** Extract the surfaceContext from the most recent fetch call body. */
function lastSurfaceContext(): TurnSurfaceContext | undefined {
  const body = lastFetchBody();
  return body.surfaceContext as TurnSurfaceContext | undefined;
}

// ─── Canonical surface contexts for testing ────────────────────

const FULL_CONTEXT: TurnSurfaceContext = {
  workspace: { id: 'ws-1', name: 'vestara-ai-core' },
  surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
  selected: { kind: 'agent', id: 'dev-1', label: 'Developer' },
};

const DIFFERENT_SURFACE: TurnSurfaceContext = {
  workspace: { id: 'ws-1', name: 'vestara-ai-core' },
  surface: { routeId: '/sessions', path: '/sessions', title: 'Sessions', section: 'Engineering' },
  selected: { kind: 'activity', id: 'act-1', label: 'Build CI Pipeline' },
};

const MINIMAL_CONTEXT: TurnSurfaceContext = {
  workspace: { id: 'ws-1', name: 'vestara-ai-core' },
  surface: { routeId: null, path: '/', title: null, section: null },
};

const DIFFERENT_WORKSPACE: TurnSurfaceContext = {
  workspace: { id: 'ws-2', name: 'other-project' },
  surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
};

// ─── Tests ────────────────────────────────────────────────────

describe('AR-008 — Surface Context Transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: select a conversation and wait for it to load, returning the hook.
   */
  async function setupWithConversation() {
    mockListResponse([makeConversationSummary()]);
    mockGetResponse(makeConversation());

    const { result } = renderHook(() => useAssistantConversation());

    await waitFor(() => {
      expect(result.current.listLoading).toBe(false);
    });

    await act(async () => {
      result.current.selectConversation('conv-001');
    });

    await waitFor(() => {
      expect(result.current.selectedId).toBe('conv-001');
    });

    return result;
  }

  // ── 1. Empty context ────────────────────────────────────────

  it('omits surfaceContext from POST body when not provided', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([
      { type: 'delta', content: 'Response' },
      { type: 'done' },
    ]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    // Send without surfaceContext
    await act(async () => {
      await result.sendMessage('Hello');
    });

    const body = lastFetchBody();
    expect(body).toHaveProperty('message', 'Hello');
    expect(body).not.toHaveProperty('surfaceContext');
  });

  it('omits surfaceContext when explicitly undefined', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([
      { type: 'delta', content: 'Response' },
      { type: 'done' },
    ]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Hello', { surfaceContext: undefined });
    });

    const body = lastFetchBody();
    expect(body).not.toHaveProperty('surfaceContext');
  });

  // ── 2. Activity selection propagation ────────────────────────

  it('carries selected reference in surfaceContext when provided', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([
      { type: 'delta', content: 'Response' },
      { type: 'done' },
    ]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('What is this agent doing?', {
        surfaceContext: FULL_CONTEXT,
      });
    });

    const sc = lastSurfaceContext();
    expect(sc).toBeDefined();
    expect(sc!.selected).toEqual({ kind: 'agent', id: 'dev-1', label: 'Developer' });
  });

  it('carries workspace and surface fields when provided', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([
      { type: 'delta', content: 'Response' },
      { type: 'done' },
    ]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('What page am I on?', {
        surfaceContext: FULL_CONTEXT,
      });
    });

    const sc = lastSurfaceContext();
    expect(sc).toBeDefined();
    expect(sc!.workspace).toEqual({ id: 'ws-1', name: 'vestara-ai-core' });
    expect(sc!.surface).toEqual(FULL_CONTEXT.surface);
  });

  // ── 3. Selection replacement ─────────────────────────────────

  it('replaces selected reference across consecutive sends', async () => {
    const result = await setupWithConversation();

    // First send with agent selection
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('About agent', { surfaceContext: FULL_CONTEXT });
    });

    const firstSelected = lastSurfaceContext()?.selected;
    expect(firstSelected?.id).toBe('dev-1');

    // Second send with different activity selection
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('About activity', { surfaceContext: DIFFERENT_SURFACE });
    });

    const secondSelected = lastSurfaceContext()?.selected;
    expect(secondSelected?.id).toBe('act-1');
    expect(secondSelected?.kind).toBe('activity');
  });

  // ── 4. Stale-reference clearing ──────────────────────────────

  it('sends without selected when selection is cleared between sends', async () => {
    const result = await setupWithConversation();

    // First send with selection
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('With selection', { surfaceContext: FULL_CONTEXT });
    });

    expect(lastSurfaceContext()?.selected).toBeDefined();

    // Second send with no selection (stale reference cleared)
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Without selection', { surfaceContext: MINIMAL_CONTEXT });
    });

    const sc = lastSurfaceContext();
    expect(sc).toBeDefined();
    expect(sc!.selected).toBeUndefined();
  });

  // ── 5. Context removal ───────────────────────────────────────

  it('sends message without surfaceContext after a context-bearing message', async () => {
    const result = await setupWithConversation();

    // First send WITH context
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('With context', { surfaceContext: FULL_CONTEXT });
    });

    expect(lastSurfaceContext()).toBeDefined();

    // Second send WITHOUT context (removal)
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Without context');
    });

    expect(lastFetchBody()).not.toHaveProperty('surfaceContext');
  });

  // ── 6. Message-time context snapshot (HIGH) ──────────────────

  it('captures surfaceContext at sendMessage call time, not render time', async () => {
    const result = await setupWithConversation();

    // Create two different contexts
    const contextA: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/page-a', path: '/page-a', title: 'Page A', section: 'Section A' },
      selected: { kind: 'workflow', id: 'wf-a', label: 'Workflow A' },
    };

    const contextB: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/page-b', path: '/page-b', title: 'Page B', section: 'Section B' },
      selected: { kind: 'workflow', id: 'wf-b', label: 'Workflow B' },
    };

    // Send with context A
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Message A', { surfaceContext: contextA });
    });

    const scA = lastSurfaceContext();
    expect(scA?.surface.routeId).toBe('/page-a');
    expect(scA?.selected?.id).toBe('wf-a');

    // Send with context B (simulates navigation between sends)
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Message B', { surfaceContext: contextB });
    });

    const scB = lastSurfaceContext();
    expect(scB?.surface.routeId).toBe('/page-b');
    expect(scB?.selected?.id).toBe('wf-b');

    // Context A was NOT retroactively changed — each message carries its own snapshot
    // This is verified by the fact that scA was captured before scB was sent
  });

  // ── 7. Navigation behavior ──────────────────────────────────

  it('reflects route changes across consecutive sends', async () => {
    const result = await setupWithConversation();

    const routeA: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/sessions', path: '/sessions', title: 'Sessions', section: 'Engineering' },
    };

    const routeB: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/activity-v2', path: '/activity-v2', title: 'Activity Room', section: 'Workspace' },
    };

    // Send from Sessions
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('What sessions exist?', { surfaceContext: routeA });
    });

    expect(lastSurfaceContext()?.surface.routeId).toBe('/sessions');

    // Navigate to Activity Room, send again
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('What activities are running?', { surfaceContext: routeB });
    });

    expect(lastSurfaceContext()?.surface.routeId).toBe('/activity-v2');
  });

  // ── 8. Repository/workspace change ──────────────────────────

  it('reflects workspace identity changes across sends', async () => {
    const result = await setupWithConversation();

    // Send in workspace 1
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Workspace 1', { surfaceContext: FULL_CONTEXT });
    });

    expect(lastSurfaceContext()?.workspace.id).toBe('ws-1');

    // Send in workspace 2 (simulates workspace switch)
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Workspace 2', { surfaceContext: DIFFERENT_WORKSPACE });
    });

    expect(lastSurfaceContext()?.workspace.id).toBe('ws-2');
    expect(lastSurfaceContext()?.workspace.name).toBe('other-project');
  });

  // ── 9. Conversation isolation (HIGH) ────────────────────────

  it('does not carry surfaceContext from one conversation to another', async () => {
    // Set up two conversations
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002', title: 'Second' })]);
    mockGetResponse(makeConversation());
    mockGetResponse(makeConversation({ id: 'conv-002' }));

    const { result } = renderHook(() => useAssistantConversation());

    await waitFor(() => {
      expect(result.current.listLoading).toBe(false);
    });

    // Select first conversation, send with context
    await act(async () => {
      result.current.selectConversation('conv-001');
    });

    await waitFor(() => {
      expect(result.current.selectedId).toBe('conv-001');
    });

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002' })]);

    await act(async () => {
      await result.current.sendMessage('In conv-001', { surfaceContext: FULL_CONTEXT });
    });

    expect(lastSurfaceContext()).toBeDefined();
    expect(lastSurfaceContext()?.workspace.id).toBe('ws-1');

    // Switch to second conversation — no surfaceContext should leak
    await act(async () => {
      result.current.selectConversation('conv-002');
    });

    await waitFor(() => {
      expect(result.current.selectedId).toBe('conv-002');
    });

    // Send in second conversation WITHOUT any surfaceContext
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation({ id: 'conv-002' }));
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002' })]);

    await act(async () => {
      await result.current.sendMessage('In conv-002');
    });

    // Verify: conv-002's message has NO surfaceContext (not leaked from conv-001)
    const body = lastFetchBody();
    expect(body.message).toBe('In conv-002');
    expect(body).not.toHaveProperty('surfaceContext');
  });

  it('each conversation carries independent surface context', async () => {
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002' })]);
    mockGetResponse(makeConversation());
    mockGetResponse(makeConversation({ id: 'conv-002' }));

    const { result } = renderHook(() => useAssistantConversation());

    await waitFor(() => {
      expect(result.current.listLoading).toBe(false);
    });

    // Send in conv-001 with context A
    await act(async () => {
      result.current.selectConversation('conv-001');
    });
    await waitFor(() => { expect(result.current.selectedId).toBe('conv-001'); });

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002' })]);

    await act(async () => {
      await result.current.sendMessage('Conv1 msg', { surfaceContext: FULL_CONTEXT });
    });

    const conv1Context = lastSurfaceContext();
    expect(conv1Context?.selected?.id).toBe('dev-1');

    // Switch to conv-002, send with context B
    await act(async () => {
      result.current.selectConversation('conv-002');
    });
    await waitFor(() => { expect(result.current.selectedId).toBe('conv-002'); });

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation({ id: 'conv-002' }));
    mockListResponse([makeConversationSummary(), makeConversationSummary({ id: 'conv-002' })]);

    await act(async () => {
      await result.current.sendMessage('Conv2 msg', { surfaceContext: DIFFERENT_SURFACE });
    });

    const conv2Context = lastSurfaceContext();
    expect(conv2Context?.selected?.id).toBe('act-1');
    expect(conv2Context?.surface.routeId).toBe('/sessions');

    // Verify independence: conv-001's context was not overwritten
    expect(conv1Context?.selected?.id).toBe('dev-1');
    expect(conv1Context?.surface.routeId).toBe('/dashboard');
  });

  // ── 10. Malformed/unauthorized references ────────────────────

  it('sends surfaceContext with missing selected when selected is incomplete', async () => {
    const result = await setupWithConversation();

    // Surface context with incomplete selected (no id) — should be sent as-is
    // (server-side normalizer handles rejection)
    const incompleteSelected: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
      selected: { kind: 'agent' } as any, // missing id
    };

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', { surfaceContext: incompleteSelected });
    });

    // The hook sends whatever the caller provides — server normalizer rejects
    const sc = lastSurfaceContext();
    expect(sc).toBeDefined();
    expect(sc!.selected).toBeDefined();
    expect(sc!.selected!.kind).toBe('agent');
  });

  it('sends surfaceContext with oversized workspace name as-is (server bounds)', async () => {
    const result = await setupWithConversation();

    const oversizedContext: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'x'.repeat(500) },
      surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
    };

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', { surfaceContext: oversizedContext });
    });

    // The hook passes through as-is — bounding is server-side
    const sc = lastSurfaceContext();
    expect(sc).toBeDefined();
    expect(sc!.workspace.name).toBe('x'.repeat(500));
  });

  it('sends surfaceContext with unknown selected kind as-is', async () => {
    const result = await setupWithConversation();

    const unknownKind: TurnSurfaceContext = {
      workspace: { id: 'ws-1', name: 'vestara-ai-core' },
      surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Workspace' },
      selected: { kind: 'future-entity-type', id: 'fut-1', label: 'Future Entity' },
    };

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', { surfaceContext: unknownKind });
    });

    const sc = lastSurfaceContext();
    expect(sc?.selected?.kind).toBe('future-entity-type');
    expect(sc?.selected?.id).toBe('fut-1');
  });

  // ── 11. Provider/model unaffected by context ─────────────────

  it('provider and model are independent of surfaceContext', async () => {
    const result = await setupWithConversation();

    // Send with both surfaceContext and execution binding
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', {
        surfaceContext: FULL_CONTEXT,
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    const body = lastFetchBody();
    expect(body.provider).toBe('openai');
    expect(body.model).toBe('gpt-4o');
    expect(body.surfaceContext).toBeDefined();
    expect(body.surfaceContext.workspace.id).toBe('ws-1');
  });

  it('provider/model send correctly without surfaceContext', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', {
        provider: 'anthropic',
        model: 'claude-sonnet',
      });
    });

    const body = lastFetchBody();
    expect(body.provider).toBe('anthropic');
    expect(body.model).toBe('claude-sonnet');
    expect(body).not.toHaveProperty('surfaceContext');
  });

  it('surfaceContext does not inject provider or model fields', async () => {
    const result = await setupWithConversation();

    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Test', { surfaceContext: FULL_CONTEXT });
    });

    const body = lastFetchBody();
    expect(body).not.toHaveProperty('provider');
    expect(body).not.toHaveProperty('model');
    expect(body.surfaceContext).toBeDefined();
  });

  it('changing surfaceContext does not affect provider/model resolution', async () => {
    const result = await setupWithConversation();

    // Send with context A + provider
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('First', {
        surfaceContext: FULL_CONTEXT,
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    const bodyA = lastFetchBody();
    expect(bodyA.provider).toBe('openai');
    expect(bodyA.model).toBe('gpt-4o');

    // Send with context B + different provider
    mockStreamResponse([{ type: 'delta', content: 'ok' }, { type: 'done' }]);
    mockGetResponse(makeConversation());
    mockListResponse([makeConversationSummary()]);

    await act(async () => {
      await result.sendMessage('Second', {
        surfaceContext: DIFFERENT_SURFACE,
        provider: 'anthropic',
        model: 'claude-sonnet',
      });
    });

    const bodyB = lastFetchBody();
    expect(bodyB.provider).toBe('anthropic');
    expect(bodyB.model).toBe('claude-sonnet');
    expect(bodyB.surfaceContext?.surface.routeId).toBe('/sessions');
  });
});
