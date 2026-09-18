// @vitest-environment jsdom

/**
 * VES-PERF-002 — assistant render-budget guards.
 *
 * The long-conversation regression (10,347 DOM nodes / ~9-13 s cold mount for
 * 50 messages) came from mounting every message and re-parsing markdown on
 * every render. jsdom has no layout engine, so windowing itself cannot be
 * asserted here; these tests guard the contracts the fix depends on:
 *
 *   1. `MarkdownRenderer` stays memoized (no re-render on unrelated updates).
 *   2. `VirtualizedMessageList` never drops messages in the no-layout fallback.
 *   3. The assistant message list stays routed through the virtualizer rather
 *      than reverting to an inline `assistant.messages.map(...)`.
 *   4. The virtualizer keeps a real overscan/estimate configuration.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VirtualizedMessageList } from '../src/components/assistant/VirtualizedMessageList';
import { MarkdownRenderer } from '../src/components/chat/MarkdownRenderer';

function readComponent(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('assistant render budget', () => {
  it('keeps markdown rendering memoized', () => {
    // Without `memo`, every streaming token re-parses the whole (100 KB+)
    // message body. `$$typeof` is the runtime memo marker React itself uses.
    const memoType = (MarkdownRenderer as unknown as { $$typeof?: symbol }).$$typeof;
    expect(memoType).toBe(Symbol.for('react.memo'));
  });

  it('never drops messages in the no-layout fallback', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      key: `m${index}`,
      node: <div data-testid="budget-row">row-{index}</div>,
    }));

    render(
      <VirtualizedMessageList
        scrollRef={{ current: null }}
        onScroll={() => {}}
        items={items}
      />,
    );

    expect(screen.getAllByTestId('budget-row')).toHaveLength(items.length);
  });

  it('keeps the assistant message list routed through the virtualizer', () => {
    const source = readComponent('../src/components/assistant/ConversationPanel.tsx');
    expect(source).toContain('VirtualizedMessageList');
    // Guards the exact regression: mapping all messages into the DOM inline.
    expect(source).not.toMatch(/assistant\.messages\.map\(/);
  });

  it('keeps overscan and size hints configured on the virtualizer', () => {
    const source = readComponent('../src/components/assistant/VirtualizedMessageList.tsx');
    expect(source).toContain('useVirtualizer');
    expect(source).toMatch(/overscan:/);
    expect(source).toMatch(/estimateSize:/);
    // Message sizes vary by >100x; a single constant estimate thrashes.
    expect(source).toMatch(/estimate\?/);
  });
});
