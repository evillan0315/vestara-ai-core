/**
 * AR-REF-001 — context assembler preserves turn surface context.
 *
 * Proves DefaultContextAssembler carries `surfaceContext` (including plural
 * `selectedReferences`) from SendOptions into CompletionRequest untouched,
 * while user content and history assembly stay unchanged — and that absent
 * surfaceContext keeps the request free of the key (existing behavior).
 */

import { describe, expect, it } from 'vitest';
import type { Conversation, TurnSurfaceContext } from '@vestara/shared';
import { DefaultContextAssembler } from '../src/index';

function conversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: 'conv-1',
    userId: 'user-1',
    title: 'Activity Room turn',
    messages: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

const SURFACE: TurnSurfaceContext = {
  workspace: { id: 'ws-1', name: 'repo' },
  surface: { routeId: '/activity', path: '/activity', title: 'Activity Room', section: 'workspace' },
  selectedReferences: [
    { kind: 'activity', id: 'act-tool-1', label: 'TOOL · bash · Failed' },
    { kind: 'activity', id: 'm9-test-2', label: 'TEST · pnpm test · Failed' },
  ],
};

describe('AR-REF-001 context assembler surfaceContext', () => {
  it('preserves plural selectedReferences into CompletionRequest', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), '@developer investigate this', { surfaceContext: SURFACE });
    expect(request.surfaceContext).toEqual(SURFACE);
  });

  it('leaves user content and history assembly unchanged', () => {
    const assembler = new DefaultContextAssembler();
    const content = '@developer investigate this';
    const request = assembler.buildContext(conversation(), content, { surfaceContext: SURFACE });
    const last = request.messages[request.messages.length - 1];
    expect(last).toMatchObject({ role: 'user', content });
  });

  it('omits surfaceContext when the caller supplies none', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), 'hello', {});
    expect(request).not.toHaveProperty('surfaceContext');
  });
});
