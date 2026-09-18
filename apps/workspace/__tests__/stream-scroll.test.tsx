// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import M11CActivityStream from '../src/pages/activity/M11CActivityStream.js';
import type { M11CStreamItem } from '../src/hooks/useM11CActivityRoom.js';

function item(id: string, sequence: number, content = `message ${id}`): M11CStreamItem {
  return {
    id,
    sequence,
    timestamp: '2026-09-16T00:00:00.000Z',
    kind: 'conversation',
    importance: 'primary',
    actor: { type: 'human', id: 'human-1', displayName: 'Eddie' },
    content,
    fresh: false,
  } as M11CStreamItem;
}

function items(count: number): M11CStreamItem[] {
  return Array.from({ length: count }, (_, i) => item(`s-${i + 1}`, i + 1));
}

interface Geometry {
  scrollHeight: number;
  clientHeight: number;
}

/** jsdom reports zero geometry: back the scroll container with a mutable box. */
function mockScrollGeometry(el: HTMLElement, box: Geometry): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.clientHeight });
}

function scrollContainer(): HTMLElement {
  return screen.getByLabelText('Activity stream');
}

interface Harness {
  onReportViewport: ReturnType<typeof vi.fn>;
  onClearUnread: ReturnType<typeof vi.fn>;
  rerenderItems: (next: M11CStreamItem[]) => void;
}

function renderStream(initial: M11CStreamItem[]): Harness {
  const onReportViewport = vi.fn();
  const onClearUnread = vi.fn();
  const view = render(
    <ThemeProvider>
      <M11CActivityStream
        items={initial}
        stateLabel="Live"
        connectionState="live"
        unread={0}
        loadingHistory={false}
        olderLoaded={0}
        loading={false}
        onLoadOlder={() => undefined}
        onReportViewport={onReportViewport}
        onClearUnread={onClearUnread}
      />
    </ThemeProvider>,
  );
  return {
    onReportViewport,
    onClearUnread,
    rerenderItems: (next: M11CStreamItem[]) =>
      view.rerender(
        <ThemeProvider>
          <M11CActivityStream
            items={next}
            stateLabel="Live"
            connectionState="live"
            unread={0}
            loadingHistory={false}
            olderLoaded={0}
            loading={false}
            onLoadOlder={() => undefined}
            onReportViewport={onReportViewport}
            onClearUnread={onClearUnread}
          />
        </ThemeProvider>,
      ),
  };
}

afterEach(() => cleanup());

describe('AR-STREAM-SCROLL-001 follow semantics', () => {
  it('A. at bottom: a new record keeps the latest visible', () => {
    const box: Geometry = { scrollHeight: 2000, clientHeight: 500 };
    const { rerenderItems } = renderStream(items(10));
    const el = scrollContainer();
    mockScrollGeometry(el, box);
    el.scrollTop = 1500;
    fireEvent.scroll(el);
    box.scrollHeight = 2200;
    rerenderItems(items(11));
    expect(el.scrollTop).toBe(2200);
  });

  it('B. reading history: an incoming record does not force the viewport down', () => {
    const box: Geometry = { scrollHeight: 2000, clientHeight: 500 };
    const { rerenderItems } = renderStream(items(10));
    const el = scrollContainer();
    mockScrollGeometry(el, box);
    el.scrollTop = 400;
    fireEvent.scroll(el);
    expect(screen.getByRole('button', { name: /Jump to latest/ })).toBeDefined();
    box.scrollHeight = 2200;
    rerenderItems(items(11));
    // Position preserved relative to bottom (400 + 200 growth), not forced down.
    expect(el.scrollTop).toBe(600);
    expect(screen.getByRole('button', { name: /Jump to latest/ })).toBeDefined();
  });

  it('C. jump reaches the settled bottom and resumes follow mode', async () => {
    const box: Geometry = { scrollHeight: 2000, clientHeight: 500 };
    const { onClearUnread, rerenderItems } = renderStream(items(10));
    const el = scrollContainer();
    mockScrollGeometry(el, box);
    el.scrollTop = 400;
    fireEvent.scroll(el);
    fireEvent.click(screen.getByRole('button', { name: /Jump to latest/ }));
    expect(el.scrollTop).toBe(2000);
    expect(onClearUnread).toHaveBeenCalledTimes(1);
    // Post-measurement growth settles after commit: the rAF phase re-pins.
    box.scrollHeight = 2350;
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(el.scrollTop).toBe(2350);
    // Follow mode resumed: the next record keeps latest visible.
    box.scrollHeight = 2500;
    rerenderItems(items(11));
    expect(el.scrollTop).toBe(2500);
  });

  it('D. streaming growth of the latest record keeps follow correct', () => {
    const box: Geometry = { scrollHeight: 2000, clientHeight: 500 };
    const { rerenderItems } = renderStream(items(10));
    const el = scrollContainer();
    mockScrollGeometry(el, box);
    el.scrollTop = 1500;
    fireEvent.scroll(el);
    // Same record count, new array identity, taller content.
    box.scrollHeight = 2100;
    rerenderItems(items(10).map((entry) => ({ ...entry, content: `${entry.content} + streamed` })));
    expect(el.scrollTop).toBe(2100);
  });

  it('E. composer lives outside the stream scroll owner', () => {
    renderStream(items(3));
    const el = scrollContainer();
    expect(el.querySelector('input')).toBeNull();
    expect(el.tagName).toBe('DIV');
  });

  it('F. large streams stay windowed with history access intact', () => {
    const box: Geometry = { scrollHeight: 20000, clientHeight: 500 };
    renderStream(items(150));
    const el = scrollContainer();
    mockScrollGeometry(el, box);
    el.scrollTop = 1000;
    fireEvent.scroll(el);
    expect(screen.getByRole('button', { name: /Load older history/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Jump to latest/ })).toBeDefined();
  });
});
