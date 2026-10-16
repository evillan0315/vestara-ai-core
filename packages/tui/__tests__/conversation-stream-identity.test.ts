/**
 * Regression guard for TUI-001: agent responses silently dropped by the
 * stream gate.
 *
 * Root cause: submit() armed the gate with an `exec-*` id while
 * streamConversation() yielded `assistant-*` ids (and `tool-*` card ids), so
 * every conversation event was rejected as stale and nothing rendered.
 *
 * Contract under test: one id per submit, threaded controller → events, with
 * tool cards namespaced `<executionId>-tool-<sequence>`. The gate accepts
 * exact matches plus namespaced tools, and still rejects foreign ids and
 * cancelled executions.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuiController } from '../src/controller';
import {
  cancelExecution,
  clearExecution,
  createStreamGate,
  gateStreamEvent,
  shouldApplyEvent,
  startExecution,
} from '../src/state/stream-gate';

const EXEC = 'exec-1234-abcd';

function armed() {
  return startExecution(createStreamGate(), EXEC);
}

describe('stream gate identity', () => {
  it('applies conversation events carrying the armed execution id', () => {
    const state = armed();
    for (const kind of ['conversation-start', 'conversation-delta', 'conversation-complete'] as const) {
      expect(gateStreamEvent(state, { kind, executionId: EXEC })).toEqual({ apply: true, reason: 'active' });
      expect(shouldApplyEvent(state, { kind, executionId: EXEC })).toBe(true);
    }
  });

  it('accepts tool cards namespaced to the armed execution', () => {
    const state = armed();
    expect(gateStreamEvent(state, { kind: 'tool', executionId: `${EXEC}-tool-0` })).toEqual({
      apply: true,
      reason: 'active',
    });
    expect(gateStreamEvent(state, { kind: 'tool', executionId: `${EXEC}-tool-7` }).apply).toBe(true);
  });

  it('rejects foreign execution ids as stale (prior-execution protection)', () => {
    const state = armed();
    expect(gateStreamEvent(state, { kind: 'conversation-delta', executionId: 'assistant-999' })).toEqual({
      apply: false,
      reason: 'stale',
    });
    expect(gateStreamEvent(state, { kind: 'tool', executionId: 'tool-999' }).apply).toBe(false);
    // Near-miss prefix without the tool namespace separator is still stale.
    expect(gateStreamEvent(state, { kind: 'tool', executionId: `${EXEC}-tool` }).apply).toBe(false);
    expect(gateStreamEvent(state, { kind: 'conversation-delta', executionId: `${EXEC}-other` }).apply).toBe(false);
  });

  it('rejects everything when cancelled or when no execution is active', () => {
    const cancelled = cancelExecution(armed());
    expect(gateStreamEvent(cancelled, { kind: 'conversation-delta', executionId: EXEC }).reason).toBe('cancelled');
    const cleared = clearExecution(armed());
    expect(gateStreamEvent(cleared, { kind: 'conversation-delta', executionId: EXEC }).reason).toBe(
      'no-active-execution',
    );
  });
});

describe('controller stream identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function envelope(sequence: number, event: unknown): string {
    return `data: ${JSON.stringify({
      schemaVersion: 1,
      conversationId: 'conv-test-1',
      messageId: 'msg-1',
      sequence,
      timestamp: '2026-10-26T00:00:00.000Z',
      event,
    })}\n\n`;
  }

  function stubConversationStream(events: readonly unknown[]): void {
    const sse = events.map((event, index) => envelope(index, event)).join('');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith('/api/conversations')) {
          return new Response(JSON.stringify({ conversation: { id: 'conv-test-1' } }), { status: 200 });
        }
        return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }),
    );
  }

  it('threads the caller execution id through every yielded event', async () => {
    stubConversationStream([
      { type: 'delta', content: 'hello ' },
      { type: 'delta', content: 'world' },
      { type: 'tool_result', name: 'read', content: 'file contents' },
    ]);
    const controller = new TuiController({ endpoint: 'http://127.0.0.1:3001' });
    const events = [];
    for await (const event of controller.execute('hi', undefined, EXEC)) events.push(event);

    const start = events.find((event) => event.type === 'conversation-start');
    const deltas = events.filter((event) => event.type === 'conversation-delta');
    const complete = events.find((event) => event.type === 'conversation-complete');
    const tools = events.filter((event) => event.type === 'tool');
    expect(start).toMatchObject({ id: EXEC });
    expect(deltas.length).toBe(2);
    for (const delta of deltas) expect(delta).toMatchObject({ id: EXEC });
    expect(complete).toMatchObject({ id: EXEC });
    expect(tools.length).toBe(1);
    expect(tools[0]).toMatchObject({ card: { tool: 'read' } });
    const toolId = (tools[0] as { card: { id: string } }).card.id;
    expect(toolId.startsWith(`${EXEC}-tool-`)).toBe(true);

    // The full submit→gate handshake: everything the controller yields for
    // this execution must pass the gate armed with the same id.
    const state = armed();
    for (const event of events) {
      if (
        event.type === 'conversation-start' ||
        event.type === 'conversation-delta' ||
        event.type === 'conversation-complete'
      ) {
        expect(gateStreamEvent(state, { kind: event.type, executionId: event.id }).apply).toBe(true);
      }
      if (event.type === 'tool') {
        expect(gateStreamEvent(state, { kind: 'tool', executionId: event.card.id }).apply).toBe(true);
      }
    }
  });

  it('falls back to a fresh assistant id for standalone callers', async () => {
    stubConversationStream([{ type: 'delta', content: 'hi' }]);
    const controller = new TuiController({ endpoint: 'http://127.0.0.1:3001' });
    const events = [];
    for await (const event of controller.execute('hi')) events.push(event);
    const start = events.find((event) => event.type === 'conversation-start');
    expect(start).toBeDefined();
    expect((start as { id: string }).id.startsWith('assistant-')).toBe(true);
  });
});
