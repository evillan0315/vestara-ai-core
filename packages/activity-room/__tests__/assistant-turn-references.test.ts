/**
 * AR-REF-001 — turn bridge propagation of Activity references.
 *
 * Proves:
 * A. A message WITHOUT references sends no surfaceContext (existing
 *    behavior unchanged).
 * B. One Activity reference reaches sendMessage options as
 *    surfaceContext.selectedReferences.
 * C. Multiple references ALL reach, in order (never first-only).
 * D. User content is byte-for-byte unchanged by reference propagation.
 * E. A caller-supplied surfaceContext base is preserved (workspace/surface/
 *    singular selected) with references merged in.
 */

import { describe, expect, it, vi } from 'vitest';
import type { TurnSurfaceReference } from '@vestara/shared';
import { triggerAssistantTurn } from '../src/assistant-turn';
import type { AgentMessageActivity } from '../src/contracts';
import type { ActivityProjectionService } from '../src/service';

// ─── Stubs ───────────────────────────────────────────────────────

const DEVELOPER = { id: 'agent-developer', name: 'Developer', provider: 'provider-a', model: 'model-a' };

function humanRecord(content: string, referencedActivityIds?: readonly string[]): AgentMessageActivity {
  return {
    id: 'activity:msg:human-1',
    sequence: 1,
    timestamp: new Date().toISOString(),
    actor: { type: 'human', id: 'user-1', displayName: 'User One' },
    kind: 'agent-message',
    agentId: 'agent-developer',
    messageKind: 'message',
    content,
    correlationId: 'corr-1',
    evidenceRefs: [],
    ...(referencedActivityIds ? { referencedActivityIds } : {}),
  };
}

function harness() {
  const sent: Array<{ conversationId: string; content: string; options?: Record<string, unknown> }> = [];
  const sendMessage = vi.fn(async (conversationId: string, content: string, options?: Record<string, unknown>) => {
    sent.push({ conversationId, content, options });
    return { message: { content }, response: { content: 'done', provider: 'provider-a', model: 'model-a' }, latency: 1 };
  });
  const createConversation = vi.fn(async () => ({ id: 'conv-1' }));
  const conversationService = { createConversation, sendMessage };
  const agentStorage = { getAgent: async (id: string) => (id === DEVELOPER.id ? DEVELOPER : null) };
  const appendActivity = vi.fn(async (record: { id: string }) => ({ ...record, id: 'appended-1' }));
  const service = { appendActivity } as unknown as ActivityProjectionService;
  return { conversationService, agentStorage, service, sent };
}

const REF_A: TurnSurfaceReference = { kind: 'activity', id: 'act-tool-1', label: 'TOOL · bash · Failed' };
const REF_B: TurnSurfaceReference = { kind: 'activity', id: 'm9-test-2', label: 'TEST · pnpm test · Failed' };

// ─── Tests ───────────────────────────────────────────────────────

describe('AR-REF-001 turn bridge reference propagation', () => {
  it('A. no references → no surfaceContext key (existing behavior unchanged)', async () => {
    const h = harness();
    const result = await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord('@developer investigate this'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });
    expect(result.status).toBe('completed');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].options ?? {}).not.toHaveProperty('surfaceContext');
  });

  it('B+D. one reference → surfaceContext reaches options; content byte-identical', async () => {
    const h = harness();
    const content = '@developer investigate this';
    await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord(content, ['act-tool-1']),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
      surfaceContext: {
        workspace: { id: 'ws-1', name: 'repo' },
        surface: { routeId: '/activity', path: '/activity', title: 'Activity Room', section: 'workspace' },
      },
      activityReferences: [REF_A],
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].content).toBe(content);
    const surfaceContext = h.sent[0].options?.surfaceContext as { selectedReferences?: TurnSurfaceReference[] };
    expect(surfaceContext.selectedReferences).toEqual([REF_A]);
  });

  it('C. multiple references all reach, in order', async () => {
    const h = harness();
    await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord('@developer investigate these failures', ['act-tool-1', 'm9-test-2']),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
      surfaceContext: {
        workspace: { id: 'ws-1', name: 'repo' },
        surface: { routeId: '/activity', path: '/activity', title: 'Activity Room', section: 'workspace' },
      },
      activityReferences: [REF_A, REF_B],
    });
    const surfaceContext = h.sent[0].options?.surfaceContext as { selectedReferences?: TurnSurfaceReference[] };
    expect(surfaceContext.selectedReferences).toEqual([REF_A, REF_B]);
  });

  it('E. caller base (workspace/surface/singular selected) is preserved with refs merged', async () => {
    const h = harness();
    const singular = { kind: 'file', id: 'file-1', label: 'open file' };
    await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord('@developer look', ['act-tool-1']),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
      surfaceContext: {
        workspace: { id: 'ws-1', name: 'repo' },
        surface: { routeId: '/activity', path: '/activity', title: 'Activity Room', section: 'workspace' },
        selected: singular,
        selectedReferences: [REF_B],
      },
      activityReferences: [REF_A],
    });
    const surfaceContext = h.sent[0].options?.surfaceContext as {
      selected?: unknown;
      selectedReferences?: TurnSurfaceReference[];
    };
    expect(surfaceContext.selected).toEqual(singular);
    expect(surfaceContext.selectedReferences).toEqual([REF_B, REF_A]);
  });
});
