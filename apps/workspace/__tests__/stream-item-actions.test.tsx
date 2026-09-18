// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import { M11CStreamItemComponent } from '../src/pages/activity/M11CStreamItem.js';
import type { M11CStreamItem } from '../src/hooks/useM11CActivityRoom.js';

const humanItem: M11CStreamItem = {
  id: 'item-1',
  sequence: 1,
  timestamp: '2026-08-27T12:00:00Z',
  kind: 'conversation',
  importance: 'primary',
  actor: { type: 'human', id: 'human-1', displayName: 'Eddie' },
  content: 'Hello team',
  fresh: false,
};

const agentItem: M11CStreamItem = {
  ...humanItem,
  id: 'item-2',
  actor: { type: 'agent', id: 'agent-1', displayName: 'Developer' },
  content: 'Working on projection',
};

const allHandlers = () => ({
  onOpenDetail: vi.fn(),
  onReply: vi.fn(),
  onEdit: vi.fn(),
  onRetract: vi.fn(),
});

function renderItem(item: M11CStreamItem, handlers = allHandlers()) {
  return render(
    <ThemeProvider>
      <M11CStreamItemComponent item={item} {...handlers} />
    </ThemeProvider>,
  );
}

afterEach(() => cleanup());

describe('stream record icon actions', () => {
  it('renders four icon actions with exact accessible names and no text buttons', () => {
    renderItem(humanItem);
    const actions = screen.getByLabelText('Record actions');
    for (const name of ['Detail', 'Reply', 'Edit', 'Retract']) {
      expect(within(actions).getByRole('button', { name })).toBeDefined();
    }
    expect(within(actions).queryByText('Detail')).toBeNull();
    expect(within(actions).queryByText('Reply')).toBeNull();
    expect(within(actions).queryByText('Edit')).toBeNull();
    expect(within(actions).queryByText('Retract')).toBeNull();
  });

  it('fires each existing handler with the item exactly as before', () => {
    const handlers = allHandlers();
    renderItem(humanItem, handlers);
    fireEvent.click(screen.getByRole('button', { name: 'Detail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retract' }));
    expect(handlers.onOpenDetail).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenDetail).toHaveBeenCalledWith(humanItem);
    expect(handlers.onReply).toHaveBeenCalledWith(humanItem);
    expect(handlers.onEdit).toHaveBeenCalledWith(humanItem);
    expect(handlers.onRetract).toHaveBeenCalledWith(humanItem);
  });

  it('preserves human-only gating for edit and retract', () => {
    renderItem(agentItem);
    expect(screen.getByRole('button', { name: 'Detail' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retract' })).toBeNull();
  });

  it('omits actions whose handlers are absent', () => {
    render(
      <ThemeProvider>
        <M11CStreamItemComponent item={humanItem} />
      </ThemeProvider>,
    );
    expect(screen.queryByLabelText('Record actions')).toBeNull();
  });

  it('keeps actions keyboard-focusable with a visible focus path', () => {
    renderItem(humanItem);
    const reply = screen.getByRole('button', { name: 'Reply' });
    reply.focus();
    expect(document.activeElement).toBe(reply);
    expect(reply.className).toMatch(/focus-visible:ring-/);
  });

  it('identifies each action through its native tooltip title', () => {
    renderItem(humanItem);
    expect(screen.getByRole('button', { name: 'Detail' }).getAttribute('title')).toBe('Detail');
    expect(screen.getByRole('button', { name: 'Reply' }).getAttribute('title')).toBe('Reply');
    expect(screen.getByRole('button', { name: 'Edit' }).getAttribute('title')).toBe('Edit');
    expect(screen.getByRole('button', { name: 'Retract' }).getAttribute('title')).toBe('Retract');
  });

  it('hides decorative icons from the accessibility tree', () => {
    renderItem(humanItem);
    const actions = screen.getByLabelText('Record actions');
    expect(within(actions).queryByRole('img')).toBeNull();
  });
});
