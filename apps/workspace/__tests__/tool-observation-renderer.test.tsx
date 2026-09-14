/**
 * GA-TOOL-UX-001B — ToolObservationRenderer tests.
 *
 * Verifies: collapsed Read presentation, expanded persisted content,
 * failed/request-context rendering, generic compatibility, operation
 * grouping (no duplicate cards), Copy uses persisted content, Open File
 * navigates the current file without touching historical content, and
 * ConversationPanel wiring renders persisted observations.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolObservation } from '@vestara/shared';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

vi.mock('../src/contexts/SurfaceContext', () => ({
  useSurfaceContext: () => ({
    workspace: { id: 'ws-test', name: 'Test Workspace' },
    surface: { routeId: '/dashboard', path: '/dashboard', title: 'Dashboard', section: 'Main' },
    selected: undefined,
  }),
  SurfaceContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ToolObservationRenderer } from '../src/components/assistant/ToolObservationRenderer';

function readObservation(overrides: Partial<ToolObservation> = {}): ToolObservation {
  return {
    toolCallId: 'call_r1',
    operationId: 'call_r1',
    observationKind: 'read',
    toolName: 'read',
    status: 'completed',
    timestamp: '2026-09-13T00:00:00.000Z',
    content: '1: alpha\n2: beta',
    read: {
      contract: 'assistant.execution.v1',
      version: 1,
      operationId: 'call_r1',
      state: 'completed',
      tool: 'read',
      source: 'opencode',
      timestamp: 1_700_000_000_000,
      kind: 'read',
      file: 'docs/notes.md',
      fileProvenance: 'runtime-provided',
      offset: 1,
      lineCount: 2,
      totalLines: 5,
      contentPreview: '1: alpha\n2: beta',
      contentTruncated: true,
      contentProvenance: 'runtime-provided',
      rangeProvenance: 'runtime-provided',
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ conversations: [] }) });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe('ToolObservationRenderer — read observation', () => {
  it('collapsed shows Read, filename, path, and range with truncation', () => {
    render(<ToolObservationRenderer observations={[readObservation()]} />);
    const card = screen.getByTestId('tool-observation');
    expect(card.getAttribute('data-kind')).toBe('read');
    expect(card.getAttribute('data-state')).toBe('completed');
    expect(screen.getByText('Read')).toBeDefined();
    expect(screen.getByText('notes.md')).toBeDefined();
    expect(screen.getByText('docs/notes.md')).toBeDefined();
    expect(screen.getByText('Lines 1–2 of 5 · truncated')).toBeDefined();
    // Collapsed: no content table yet.
    expect(screen.queryByTestId('read-observation-content')).toBeNull();
  });

  it('expanded shows persisted numbered content, truncation note, Copy and Open File', () => {
    const onOpenInEditor = vi.fn();
    render(<ToolObservationRenderer observations={[readObservation()]} onOpenInEditor={onOpenInEditor} />);
    fireEvent.click(screen.getByTestId('read-observation-toggle'));
    const content = screen.getByTestId('read-observation-content');
    expect(content).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.getByText('alpha')).toBeDefined();
    expect(screen.getByText('beta')).toBeDefined();
    expect(screen.getByText('Observation truncated')).toBeDefined();
    expect(screen.getByTestId('read-observation-copy')).toBeDefined();
    expect(screen.getByTestId('read-observation-open')).toBeDefined();
    // No wrapper syntax, no callID, no absolute paths.
    expect(content.textContent).not.toContain('<content>');
    expect(content.textContent).not.toContain('call_r1');
    expect(content.textContent).not.toContain('/home/');
  });

  it('Copy uses persisted historical content', async () => {
    render(<ToolObservationRenderer observations={[readObservation()]} />);
    fireEvent.click(screen.getByTestId('read-observation-toggle'));
    fireEvent.click(screen.getByTestId('read-observation-copy'));
    await screen.findByText('Copied');
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('1: alpha\n2: beta');
  });

  it('Open File navigates the current file without touching historical content', () => {
    const onOpenInEditor = vi.fn();
    render(<ToolObservationRenderer observations={[readObservation()]} onOpenInEditor={onOpenInEditor} />);
    fireEvent.click(screen.getByTestId('read-observation-toggle'));
    fireEvent.click(screen.getByTestId('read-observation-open'));
    expect(onOpenInEditor).toHaveBeenCalledTimes(1);
    expect(onOpenInEditor).toHaveBeenCalledWith('docs/notes.md');
    // Historical content unchanged and still rendered.
    expect(screen.getByText('alpha')).toBeDefined();
    expect(screen.getByTestId('read-observation-content')).toBeDefined();
  });

  it('failed read shows request context and bounded error, never as result evidence', () => {
    render(
      <ToolObservationRenderer
        observations={[
          readObservation({
            status: 'failed',
            content: '',
            error: 'ENOENT: no such file',
            read: { ...readObservation().read!, state: 'failed', file: 'requested/missing.ts', fileProvenance: 'request-context', contentPreview: undefined, contentProvenance: 'unavailable', rangeProvenance: 'unavailable', error: 'ENOENT: no such file' },
          }),
        ]}
      />,
    );
    const card = screen.getByTestId('tool-observation');
    expect(card.getAttribute('data-state')).toBe('failed');
    expect(screen.getByText('Request context')).toBeDefined();
    expect(screen.getByText('ENOENT: no such file')).toBeDefined();
    fireEvent.click(screen.getByTestId('read-observation-toggle'));
    expect(screen.getByText('Failed')).toBeDefined();
  });

  it('running read shows request-context reading state without content claims', () => {
    render(
      <ToolObservationRenderer
        observations={[
          readObservation({
            status: 'running',
            content: '',
            read: { ...readObservation().read!, state: 'running', file: 'requested/path.ts', fileProvenance: 'request-context', contentPreview: undefined, contentProvenance: 'unavailable', rangeProvenance: 'unavailable', offset: undefined, lineCount: undefined, totalLines: undefined },
          }),
        ]}
      />,
    );
    expect(screen.getByText('Reading requested/path.ts…')).toBeDefined();
    expect(screen.getByText('Request context')).toBeDefined();
  });

  it('groups running + terminal projections of one operation into a single card', () => {
    render(
      <ToolObservationRenderer
        observations={[
          readObservation({ status: 'running', content: '' }),
          readObservation(),
          { toolCallId: 'call_b1', operationId: 'call_b1', toolName: 'bash', status: 'completed', timestamp: '2026-09-13T00:00:01.000Z', content: 'done' },
        ]}
      />,
    );
    const cards = screen.getAllByTestId('tool-observation');
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('data-kind')).toBe('read');
    expect(cards[0].getAttribute('data-state')).toBe('completed');
    expect(cards[1].getAttribute('data-kind')).toBe('generic');
  });

  it('generic tools remain compatible', () => {
    render(
      <ToolObservationRenderer
        observations={[
          { toolCallId: 'c1', toolName: 'bash', status: 'completed', timestamp: '2026-09-13T00:00:00.000Z', content: 'done' },
        ]}
      />,
    );
    const card = screen.getByTestId('tool-observation');
    expect(card.getAttribute('data-kind')).toBe('generic');
    expect(screen.getByText('Bash')).toBeDefined();
  });

  it('renders nothing without observations', () => {
    const { container } = render(<ToolObservationRenderer observations={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ConversationPanel — durable observation wiring', () => {
  it('assistant message with persisted observations renders the Read card', async () => {
    const mod = await import('../src/components/assistant/ConversationPanel');
    const assistant = {
      conversations: [],
      listLoading: false,
      listError: null,
      selectedId: 'conv-1',
      selectedConversation: null,
      selectConversation: vi.fn(),
      createConversation: vi.fn(),
      messages: [
        { id: 'm1', role: 'user', content: 'Read it', createdAt: '2026-09-13T00:00:00Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Done.',
          createdAt: '2026-09-13T00:00:01Z',
          toolObservations: [readObservation()],
        },
      ],
      loadMessages: vi.fn(),
      sendMessage: vi.fn(),
      streamState: 'idle',
      streamingText: '',
      streamError: null,
      abortStream: vi.fn(),
    } as any;
    render(
      <MemoryRouter>
        <mod.ConversationPanel assistant={assistant} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tool-observation-list')).toBeDefined();
    expect(screen.getByText('notes.md')).toBeDefined();
  });
});
