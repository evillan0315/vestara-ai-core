/** @vitest-environment jsdom */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import M11CActivityStream from './M11CActivityStream';
import type { M11CStreamItem } from '../../hooks/useM11CActivityRoom';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);

const item: M11CStreamItem = {
  id: 'activity-message-1',
  sequence: 1,
  timestamp: '2026-09-24T00:00:00.000Z',
  kind: 'conversation',
  importance: 'primary',
  actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
  content: 'Activity message',
  fresh: false,
};

describe('M11C Activity stream drawer wiring', () => {
  it('renders a stream item when the Files drawer callback is supplied', () => {
    expect(() =>
      render(
        <M11CActivityStream
          items={[item]}
          stateLabel="Live"
          connectionState="live"
          unread={0}
          loadingHistory={false}
          olderLoaded={0}
          loading={false}
          onReportViewport={vi.fn()}
          onClearUnread={vi.fn()}
          onInspectEdit={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
