// @vitest-environment jsdom
/**
 * AR-UI-REPLY-001 — Source-aware Activity Reply (focused tests).
 *
 * Proves, without touching domain contracts:
 * - Assistant-origin record (authoritative reference) → Assistant opens on
 *   the CORRECT EXISTING conversation; composer focus requested; nothing created.
 * - Activity Room-origin reply remains local.
 * - Missing/unknown origin fails safely (local, no throw, no dispatch).
 * - No duplicate conversation is created (detail carries no creation request;
 *   parse never yields one).
 * - No inference from presentation text (agent name / display text / icon /
 *   content never consulted).
 * - Keyboard activation shares the click path (native button → same handler).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  OPEN_ASSISTANT_EVENT,
  handleActivityReply,
  parseOpenAssistantDetail,
  requestOpenAssistantConversation,
  resolveAssistantConversationId,
  routeActivityReply,
} from '../assistant-navigation';

function activityRoomItem() {
  return {
    id: 'stream-1',
    sequence: 7,
    timestamp: new Date().toISOString(),
    kind: 'conversation',
    importance: 'primary',
    actor: { type: 'human', id: 'local', displayName: 'You' },
    content: 'Ship the milestone today',
    fresh: false,
  };
}

describe('resolveAssistantConversationId', () => {
  it('resolves the authoritative originConversationId', () => {
    expect(resolveAssistantConversationId({ ...activityRoomItem(), originConversationId: 'conv-abc' })).toBe(
      'conv-abc',
    );
  });

  it('resolves candidate key aliases without domain changes', () => {
    expect(resolveAssistantConversationId({ assistantConversationId: 'conv-a' })).toBe('conv-a');
    expect(resolveAssistantConversationId({ sourceConversationId: 'conv-s' })).toBe('conv-s');
  });

  it('resolves the M9 passthrough shape payload.data.conversationId', () => {
    expect(resolveAssistantConversationId({ payload: { data: { conversationId: 'conv-m9' } } })).toBe('conv-m9');
  });

  it('returns null for missing/unknown origin (fail safe)', () => {
    expect(resolveAssistantConversationId(activityRoomItem())).toBeNull();
    expect(resolveAssistantConversationId(null)).toBeNull();
    expect(resolveAssistantConversationId(undefined)).toBeNull();
    expect(resolveAssistantConversationId({ originConversationId: '' })).toBeNull();
    expect(resolveAssistantConversationId({ originConversationId: '   ' })).toBeNull();
    expect(resolveAssistantConversationId({ originConversationId: 42 })).toBeNull();
    expect(resolveAssistantConversationId({ originConversationId: null })).toBeNull();
  });

  it('never infers origin from presentation text, agent name, icon, or content', () => {
    const disguised = {
      ...activityRoomItem(),
      agentId: 'agent-assistant',
      icon: 'assistant-spark',
      kind: 'agent-message',
      actor: { type: 'agent', id: 'agent-assistant', displayName: 'Assistant' },
      content: 'Vestara Assistant replied here with full conversation context',
      effect: 'message',
    };
    expect(resolveAssistantConversationId(disguised)).toBeNull();
    expect(routeActivityReply(disguised)).toEqual({ kind: 'activity-room' });
  });
});

describe('routeActivityReply', () => {
  it('routes Assistant-origin records to the existing conversation', () => {
    expect(routeActivityReply({ ...activityRoomItem(), originConversationId: 'conv-keep' })).toEqual({
      kind: 'assistant',
      conversationId: 'conv-keep',
    });
  });

  it('keeps Activity Room-origin replies local', () => {
    expect(routeActivityReply(activityRoomItem())).toEqual({ kind: 'activity-room' });
  });
});

describe('handleActivityReply', () => {
  it('Assistant-origin: dispatches open-assistant with the existing id, skips local reply', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const localReply = vi.fn();
    const item = { ...activityRoomItem(), originConversationId: 'conv-correct' };

    const route = handleActivityReply(item, localReply);

    expect(route).toEqual({ kind: 'assistant', conversationId: 'conv-correct' });
    expect(localReply).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(OPEN_ASSISTANT_EVENT);
    // Correct existing conversation selected — the exact authoritative id.
    expect(event.detail.conversationId).toBe('conv-correct');
    // Composer focus requested through the existing focus contract.
    expect(event.detail.focusComposer).toBe(true);
    // No duplicate conversation: the request carries no creation signal.
    expect(event.detail.create).toBeUndefined();
    expect(event.detail.createConversation).toBeUndefined();
    dispatch.mockRestore();
  });

  it('Activity Room-origin: stays local, dispatches nothing', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const localReply = vi.fn();
    const item = activityRoomItem();

    const route = handleActivityReply(item, localReply);

    expect(route).toEqual({ kind: 'activity-room' });
    expect(localReply).toHaveBeenCalledTimes(1);
    expect(localReply).toHaveBeenCalledWith(item);
    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });

  it('missing/unknown origin fails safely (local, no throw)', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const localReply = vi.fn();

    for (const bad of [null, undefined, {}, { originConversationId: '' }, { originConversationId: 7 }]) {
      expect(() => handleActivityReply(bad as never, localReply as never)).not.toThrow();
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(localReply).toHaveBeenCalled();
    dispatch.mockRestore();
  });

  it('keyboard activation shares the click path (same handler, same route)', () => {
    // The Reply control is a native <button>: Enter/Space fire the same
    // handler as click. Both entry points call handleActivityReply.
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const localReply = vi.fn();
    const item = { ...activityRoomItem(), originConversationId: 'conv-kbd' };

    const onReply = (entry: typeof item) => handleActivityReply(entry, localReply);
    const viaClick = onReply(item);
    const viaKeyboardEnter = onReply(item);

    expect(viaClick).toEqual({ kind: 'assistant', conversationId: 'conv-kbd' });
    expect(viaKeyboardEnter).toEqual(viaClick);
    expect(localReply).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(2);
    dispatch.mockRestore();
  });
});

describe('requestOpenAssistantConversation / parseOpenAssistantDetail', () => {
  it('dispatches the reused open-assistant event with focus requested', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    requestOpenAssistantConversation('conv-focus');
    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(OPEN_ASSISTANT_EVENT);
    expect(event.detail).toMatchObject({ conversationId: 'conv-focus', focusComposer: true });
    dispatch.mockRestore();
  });

  it('parses conversation selection without ever yielding a creation request', () => {
    const parsed = parseOpenAssistantDetail({ conversationId: 'conv-keep', expanded: true });
    expect(parsed.conversationId).toBe('conv-keep');
    expect(parsed.expanded).toBe(true);
    expect(parsed.focusComposer).toBe(true);
    expect('create' in parsed).toBe(false);
  });

  it('drops blank/non-string ids (Global Assistant must not select or create)', () => {
    expect(parseOpenAssistantDetail({ conversationId: '' }).conversationId).toBeUndefined();
    expect(parseOpenAssistantDetail({ conversationId: '  ' }).conversationId).toBeUndefined();
    expect(parseOpenAssistantDetail({ conversationId: 123 }).conversationId).toBeUndefined();
    expect(parseOpenAssistantDetail(null).conversationId).toBeUndefined();
    expect(parseOpenAssistantDetail({ expanded: 'yes' }).expanded).toBe(false);
  });
});
