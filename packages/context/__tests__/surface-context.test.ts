/**
 * AR-REF-001 — context assembler preserves turn surface context.
 *
 * Proves DefaultContextAssembler carries `surfaceContext` (including plural
 * `selectedReferences`) from SendOptions into CompletionRequest untouched,
 * while user content and history assembly stay unchanged — and that absent
 * surfaceContext keeps the request free of the key (existing behavior).
 */

import type { ExecutionActor } from '@vestara/execution-types';
import type { Conversation, TurnSurfaceContext } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
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

const ACTOR: ExecutionActor = { kind: 'human', id: 'hp-canonical-1' };

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

  it('carries the canonical ExecutionActor without presentation or authority fields', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), 'hello', { actor: ACTOR });

    expect(request.actor).toEqual(ACTOR);
    expect(request.actor).not.toHaveProperty('role');
    expect(request.actor).not.toHaveProperty('displayName');
    expect(request.actor).not.toHaveProperty('permissions');
  });

  it('omits actor context when identity is unresolved', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), 'hello');

    expect(request).not.toHaveProperty('actor');
  });

  it('renders only the bounded preferred name projection into provider-neutral context', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), 'hello', {
      actor: ACTOR,
      assistantIdentity: { preferredName: 'Operator' },
    });

    expect(request.messages[0]?.content).toContain('"preferredName":"Operator"');
    expect(request.messages[0]?.content).not.toContain(ACTOR.id);
    expect(request.messages[0]?.content).not.toContain('permissions');
  });

  it('leaves model-visible identity absent when no governed projection exists', () => {
    const assembler = new DefaultContextAssembler();
    const request = assembler.buildContext(conversation(), 'hello', { actor: ACTOR });

    expect(request.messages[0]?.content).not.toContain('Preferred name:');
    expect(request).not.toHaveProperty('assistantIdentity');
  });
});
