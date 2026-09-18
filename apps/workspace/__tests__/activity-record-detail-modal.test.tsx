// @vitest-environment jsdom
/**
 * AR-UI-DETAIL-001 — Activity Record Detail Modal.
 *
 * The Activity Stream stays a concise projection; clicking `Detail` must open
 * a readable modal dialog with the complete available record detail:
 *   - record/event type, actor/agent/source, timestamp, status;
 *   - workflow/execution relationship where available;
 *   - complete textual content rendered through the canonical MarkdownRenderer
 *     (never unsafe raw HTML);
 *   - evidence/artifact references where already represented;
 *   - accessible dialog semantics (focus in, Escape/Close out, focus return).
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no layout, so the virtualized stream would mount zero rows.
// Mount every row in tests; production virtualization is untouched.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    getItemKey,
  }: {
    count: number;
    getItemKey: (index: number) => string | number;
  }) => ({
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ key: getItemKey(index), index, start: index * 76 })),
    measureElement: () => {},
  }),
}));
import M11CActivityDetailModal from '../src/pages/activity/M11CActivityDetailModal.js';
import M11CActivityRoomPage from '../src/pages/activity/M11CActivityRoomPage.js';
import { ThemeProvider } from '../src/lib/theme.js';
import type { M11CStreamItem } from '../src/hooks/useM11CActivityRoom.js';
import { warmMarkdownRenderer } from './helpers/markdown-warmup';

const RICH_CONTENT = [
  '## Plan update',
  '',
  'The **planner** finished decomposing the milestone:',
  '',
  '- [x] scope the projection',
  '- [ ] wire the read API',
  '',
  'Run validation with `pnpm check`:',
  '',
  '```bash',
  'pnpm lint:check && pnpm build',
  'echo "a very long line that must not break the modal layout but scroll horizontally inside its own code container instead of overflowing the dialog panel width"',
  '```',
  '',
  '| Check | Result |',
  '| ----- | ------ |',
  '| lint  | pass   |',
  '',
  'See [runbook](https://example.com/runbook) for follow-up.',
  '',
  '<script>alert("xss")</script>',
].join('\n');

const richItem: M11CStreamItem = {
  id: 'stream-item-7',
  sequence: 42,
  timestamp: '2026-09-10T08:30:00.000Z',
  kind: 'activity',
  importance: 'primary',
  actor: { type: 'agent', id: 'agent-planner', displayName: 'Planner', role: 'planner' },
  content: RICH_CONTENT,
  workflowRunId: 'wf-9',
  executionId: 'exec-3',
  taskId: 'task-12',
  fresh: false,
  referencedActivityIds: ['activity:evt-40', 'activity:evt-41'],
};

const drillDown: readonly M11CStreamItem[] = [
  {
    id: 'activity:evt-40',
    sequence: 40,
    timestamp: '2026-09-10T08:29:00.000Z',
    kind: 'conversation',
    importance: 'secondary',
    actor: { type: 'human', id: 'human-1', displayName: 'Eddie' },
    content: 'Please break this down further.',
    fresh: false,
  },
];

function renderModal(
  item: M11CStreamItem | null = richItem,
  props: Partial<{ drillDownRecords: readonly M11CStreamItem[]; drillDownLoading: boolean }> = {},
) {
  return render(
    <ThemeProvider>
      <M11CActivityDetailModal
        item={item}
        drillDownRecords={props.drillDownRecords}
        drillDownLoading={props.drillDownLoading}
        onClose={() => {}}
      />
    </ThemeProvider>,
  );
}

beforeAll(async () => {
  await warmMarkdownRenderer();
});

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  mockFetchSuccess();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  wsInstance = null;
});

describe('Activity Record Detail Modal (AR-UI-DETAIL-001)', () => {
  it('renders nothing when no record is selected', () => {
    renderModal(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a dialog with title and record subline', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: /Activity detail/ });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Activity Detail' })).toBeTruthy();
    // Subline carries actor • type • timestamp.
    expect(within(dialog).getByText(/Planner.*Activity.*2026/)).toBeTruthy();
  });

  it('renders complete markdown: headings, lists, code, tables, links', async () => {
    const { container } = renderModal();
    await screen.findByRole('dialog');

    // Headings / lists via the canonical renderer (not plain text).
    await waitFor(() => expect(container.querySelector('.markdown h2')).toBeTruthy());
    expect(container.querySelectorAll('.markdown li').length).toBeGreaterThan(0);
    // Fenced code block keeps formatting inside its own horizontal scroll
    // container (CodeBlock renders `div.overflow-x-auto > pre`, nested under
    // the markdown-generated `pre` wrapper) instead of overflowing the dialog.
    const scrollPre = container.querySelector('.markdown .overflow-x-auto pre');
    expect(scrollPre).toBeTruthy();
    expect(scrollPre?.textContent).toContain('pnpm lint:check');
    // GFM table support.
    expect(container.querySelector('.markdown table')).toBeTruthy();
    // Safe link semantics.
    const link = container.querySelector('.markdown a[href="https://example.com/runbook"]');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('never renders Markdown through unsafe raw HTML', async () => {
    const { container } = renderModal();
    await screen.findByRole('dialog');
    await waitFor(() => expect(container.querySelector('.markdown')).toBeTruthy());
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows record type, actor, timestamp, status, and workflow/execution metadata', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    const scoped = within(dialog);
    expect(scoped.getByText('Type')).toBeTruthy();
    expect(scoped.getByText(/primary/)).toBeTruthy();
    expect(scoped.getByText('Actor')).toBeTruthy();
    expect(scoped.getByText('Agent / Source')).toBeTruthy();
    expect(scoped.getByText('agent-planner')).toBeTruthy();
    expect(scoped.getByText('Timestamp')).toBeTruthy();
    expect(scoped.getByText('Sequence')).toBeTruthy();
    expect(scoped.getByText('Workflow')).toBeTruthy();
    expect(scoped.getByText('wf-9')).toBeTruthy();
    expect(scoped.getByText('Execution')).toBeTruthy();
    expect(scoped.getByText('exec-3')).toBeTruthy();
    expect(scoped.getByText('Task')).toBeTruthy();
    expect(scoped.getByText('task-12')).toBeTruthy();
    // Threading references already represented on the record.
    expect(scoped.getByText('References')).toBeTruthy();
    expect(scoped.getByText(/activity:evt-40/)).toBeTruthy();
  });

  it('omits unavailable relationship rows instead of inventing them', async () => {
    renderModal({ ...richItem, workflowRunId: undefined, executionId: undefined, taskId: undefined });
    const dialog = await screen.findByRole('dialog');
    const scoped = within(dialog);
    expect(scoped.queryByText('Workflow')).toBeNull();
    expect(scoped.queryByText('Execution')).toBeNull();
    expect(scoped.queryByText('Task')).toBeNull();
  });

  it('renders drill-down referenced activities with full readable content', async () => {
    renderModal(richItem, { drillDownRecords: drillDown });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Referenced Activities \(1\)/)).toBeTruthy();
    expect(within(dialog).getByText('Please break this down further.')).toBeTruthy();
  });

  it('moves focus into the dialog on open', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('closes via explicit Close and returns focus to the opener', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <ThemeProvider>
          <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
            opener
          </button>
          {open && <M11CActivityDetailModal item={richItem} onClose={() => setOpen(false)} />}
        </ThemeProvider>
      );
    }
    render(<Harness />);

    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Close activity detail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('closes via Escape', async () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <M11CActivityDetailModal item={richItem} onClose={onClose} />
      </ThemeProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it(
    'Detail action on the live Activity Room opens the modal for that record',
    { timeout: 30_000 },
    async () => {
    render(
      <ThemeProvider>
        <M11CActivityRoomPage />
      </ThemeProvider>,
    );
    // Snapshot → subscribe → catch-up can take a moment under load.
    const detailButton = await screen.findByRole(
      'button',
      { name: 'Open detail for Eddie activity' },
      { timeout: 10_000 },
    );
    fireEvent.click(detailButton);

    const dialog = await screen.findByRole('dialog', { name: /Activity detail/ });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Activity Detail' })).toBeTruthy();
    // Complete record content (not the clamped stream preview).
    expect(within(dialog).getByText('Hello team')).toBeTruthy();
    // Stream stays mounted behind the dialog.
    expect(screen.getAllByText('Working on projection').length).toBeGreaterThanOrEqual(1);
    },
  );
});

// ─── Page harness (mirrors m11c-activity-room.test.tsx) ──────

let wsInstance: MockWebSocket | null = null;

class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 0;

  constructor(_url: string) {
    wsInstance = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({
          op: 'subscribed',
          cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' },
          frontier: 10,
        }),
      });
    });
  }

  send(_data: string): void {}
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const mockSnapshot = {
  room: {
    roomId: 'room-1',
    name: 'Activity Room',
    cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' },
    rebuiltAt: '2026-08-27T12:00:00Z',
  },
  participants: [
    {
      participantId: 'human-1',
      type: 'human' as const,
      displayName: 'Eddie',
      membership: 'member' as const,
      presence: 'online' as const,
      workState: 'working' as const,
      joinedAt: '2026-08-27T12:00:00Z',
      lastActivityAt: '2026-08-27T12:01:00Z',
    },
  ],
  stream: [
    {
      streamItemId: 's1',
      activityId: 'a1',
      sequenceNumber: 1,
      kind: 'conversation',
      importance: 'primary' as const,
      actor: { type: 'human', id: 'human-1', displayName: 'Eddie' },
      content: 'Hello team',
      timestamp: '2026-08-27T12:00:00Z',
    },
    {
      streamItemId: 's2',
      activityId: 'a2',
      sequenceNumber: 2,
      kind: 'activity',
      importance: 'secondary' as const,
      actor: { type: 'agent', id: 'agent-1', displayName: 'Developer' },
      content: 'Working on projection',
      timestamp: '2026-08-27T12:00:01Z',
    },
  ],
  workflowSummary: null,
  attention: [],
  contextualCapabilities: { mentionableParticipants: [], availableCommands: [], referenceableEntities: [] },
  cursor: { sequenceNumber: 10, eventId: 'evt-10', timestamp: '2026-08-27T12:00:00Z' },
};

function mockFetchSuccess(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/activity-room/v1/snapshot')) {
        return { ok: true, json: async () => mockSnapshot };
      }
      if (String(url).includes('/api/activity-room/v1/activities')) {
        return { ok: true, json: async () => ({ records: [], count: 0, limit: 50, nextCursor: null }) };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
}
