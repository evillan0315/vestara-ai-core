/** @vitest-environment node */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type AssistantTurnBinding, useAssistantTurn } from '../src/react';

function capture(): { binding: AssistantTurnBinding | null } {
  const holder: { binding: AssistantTurnBinding | null } = { binding: null };
  function Probe() {
    holder.binding = useAssistantTurn();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return holder;
}

describe('useAssistantTurn', () => {
  it('exposes the shared turn store and mutates it', () => {
    const { binding } = capture();
    expect(binding).not.toBeNull();
    binding?.onToolStart('bash');
    binding?.onDelta('working ');
    expect(binding?.turn.operations).toHaveLength(1);
    expect(binding?.turn.streamingText).toBe('working ');
    binding?.onToolResult('bash', 'ok');
    expect(binding?.turn.operations[0]?.state).toBe('completed');
    binding?.reset();
    expect(binding?.turn.operations).toHaveLength(0);
  });

  it('rehydrates durable history through the binding', () => {
    const { binding } = capture();
    binding?.rehydrateFromMessages([
      {
        id: 'm-1',
        conversationId: 'c-1',
        role: 'assistant',
        content: 'done',
        createdAt: '2026-10-26T00:00:00.000Z',
        toolObservations: [
          { toolCallId: 'c-1', operationId: 'op-9', toolName: 'edit', status: 'completed', content: 'patched' },
        ],
      },
    ]);
    expect(binding?.turn.operations.map((op) => op.id)).toEqual(['hist-op-9']);
  });
});
