/**
 * VES-PERF-002 (P0) — bounded DOM for the assistant message list.
 *
 * The conversation persists and transports a bounded message window, but the
 * renderer previously mounted every message (observed: 10,347 DOM nodes for a
 * 50-message conversation, ~9–13 s cold mount, 9–16 FPS scroll). This
 * component renders only the messages intersecting the viewport (+ overscan)
 * while keeping the scroll container's geometry intact.
 *
 * Ownership note: the component that calls `useVirtualizer` MUST own the
 * scroll element. React attaches host refs during the layout phase, and a
 * descendant's layout effect runs before its ancestor's ref is attached — so
 * if the scroll div lived in the parent, `getScrollElement()` would return
 * `null` on first run and the list would stay empty until an unrelated
 * re-render. Hence `ScrollSurface` is rendered from inside the virtualized
 * component.
 *
 * Fallback contract: environments without `ResizeObserver` (jsdom under
 * vitest) cannot measure the scroll container, so the full list is rendered in
 * normal flow. That keeps component/visual contracts deterministic in tests
 * while real browsers get windowed rendering.
 *
 * @see docs/blueprint/VES-PERF-001-bounded-data-loading-ui-runtime-performance.md
 */

import { useVirtualizer } from '@tanstack/react-virtual';

export interface MessageListItem {
  /** Stable React key (message id, optimistic turn id, or a sentinel). */
  key: string;
  /** Rendered node — created eagerly, mounted only when windowed in. */
  node: React.ReactNode;
  /**
   * Rough height hint in px. Assistant messages vary from ~1 KB to >200 KB,
   * so a single constant estimate makes the virtualizer over-correct on every
   * measurement. A content-derived hint converges far faster.
   */
  estimate?: number;
}

const CAN_VIRTUALIZE = typeof ResizeObserver !== 'undefined';

interface VirtualizedMessageListProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  items: MessageListItem[];
}

export function VirtualizedMessageList({ scrollRef, onScroll, items }: VirtualizedMessageListProps) {
  if (!CAN_VIRTUALIZE) {
    return (
      <ScrollSurface scrollRef={scrollRef} onScroll={onScroll}>
        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.key}>{item.node}</div>
          ))}
        </div>
      </ScrollSurface>
    );
  }
  return <WindowedMessageList scrollRef={scrollRef} onScroll={onScroll} items={items} />;
}

function WindowedMessageList({ scrollRef, onScroll, items }: VirtualizedMessageListProps) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => items[index]?.estimate ?? 220,
    overscan: 2,
    getItemKey: (index) => items[index]?.key ?? index,
  });

  return (
    <ScrollSurface scrollRef={scrollRef} onScroll={onScroll}>
      {/* `height`/`transform` below are virtualizer-computed layout geometry
          (pixel offsets), not design values — they cannot be tokenized. */}
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full pb-6"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {items[virtualItem.index]?.node}
          </div>
        ))}
      </div>
    </ScrollSurface>
  );
}

/** The scroll container. Rendered inside the virtualized subtree on purpose. */
function ScrollSurface({
  scrollRef,
  onScroll,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      tabIndex={-1}
      role="log"
      aria-live="polite"
      aria-label="Assistant conversation"
      data-testid="conversation-scroll"
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5 focus:outline-none min-w-0"
    >
      {children}
    </div>
  );
}
