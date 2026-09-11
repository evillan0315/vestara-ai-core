/**
 * M11C Activity Room UI State Hook
 *
 * Consolidates modal, drawer, and transient UI state for the Activity Room
 * page. Replaces 5+ individual useState calls with a single reducer that
 * guarantees mutual exclusivity (only one modal/drawer open at a time).
 *
 * State categories:
 *   - Modals: detail, edit, thread (mutually exclusive)
 *   - Drawers: agent control (mutually exclusive with modals)
 *   - Composer: reply-to (can coexist with other state)
 */

import { useCallback, useReducer } from 'react';
import type { M11CStreamItem } from './useM11CActivityRoom';

// ─── Types ───────────────────────────────────────────────────

export interface ActivityRoomUIState {
  /** Detail modal — shows full item metadata. */
  readonly detailItem: M11CStreamItem | null;
  /** Edit modal — edit message content. */
  readonly editingItem: M11CStreamItem | null;
  /** Thread modal — shows threaded conversation. */
  readonly threadActivityIds: readonly string[];
  /** Agent control drawer — shows agent projection. */
  readonly agentControlParticipantId: string | undefined;
  /** Reply-to target in composer. */
  readonly replyToItem: M11CStreamItem | null;
}

type Action =
  | { readonly type: 'OPEN_DETAIL'; readonly item: M11CStreamItem }
  | { readonly type: 'CLOSE_DETAIL' }
  | { readonly type: 'OPEN_EDIT'; readonly item: M11CStreamItem }
  | { readonly type: 'CLOSE_EDIT' }
  | { readonly type: 'OPEN_THREAD'; readonly activityIds: readonly string[] }
  | { readonly type: 'CLOSE_THREAD' }
  | { readonly type: 'OPEN_AGENT_CONTROL'; readonly participantId: string }
  | { readonly type: 'CLOSE_AGENT_CONTROL' }
  | { readonly type: 'SET_REPLY_TO'; readonly item: M11CStreamItem | null }
  | { readonly type: 'CLOSE_ALL' };

const INITIAL_STATE: ActivityRoomUIState = {
  detailItem: null,
  editingItem: null,
  threadActivityIds: [],
  agentControlParticipantId: undefined,
  replyToItem: null,
};

function reducer(state: ActivityRoomUIState, action: Action): ActivityRoomUIState {
  switch (action.type) {
    case 'OPEN_DETAIL':
      // Close other modals, keep reply-to and agent control
      return {
        ...state,
        detailItem: action.item,
        editingItem: null,
        threadActivityIds: [],
      };
    case 'CLOSE_DETAIL':
      return { ...state, detailItem: null };

    case 'OPEN_EDIT':
      return {
        ...state,
        editingItem: action.item,
        detailItem: null,
        threadActivityIds: [],
      };
    case 'CLOSE_EDIT':
      return { ...state, editingItem: null };

    case 'OPEN_THREAD':
      return {
        ...state,
        threadActivityIds: action.activityIds,
        detailItem: null,
        editingItem: null,
      };
    case 'CLOSE_THREAD':
      return { ...state, threadActivityIds: [] };

    case 'OPEN_AGENT_CONTROL':
      return {
        ...state,
        agentControlParticipantId: action.participantId,
        detailItem: null,
        editingItem: null,
        threadActivityIds: [],
      };
    case 'CLOSE_AGENT_CONTROL':
      return { ...state, agentControlParticipantId: undefined };

    case 'SET_REPLY_TO':
      return { ...state, replyToItem: action.item };

    case 'CLOSE_ALL':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────

export function useActivityRoomUI() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const openDetail = useCallback((item: M11CStreamItem) => dispatch({ type: 'OPEN_DETAIL', item }), []);
  const closeDetail = useCallback(() => dispatch({ type: 'CLOSE_DETAIL' }), []);

  const openEdit = useCallback((item: M11CStreamItem) => dispatch({ type: 'OPEN_EDIT', item }), []);
  const closeEdit = useCallback(() => dispatch({ type: 'CLOSE_EDIT' }), []);

  const openThread = useCallback((activityIds: readonly string[]) => dispatch({ type: 'OPEN_THREAD', activityIds }), []);
  const closeThread = useCallback(() => dispatch({ type: 'CLOSE_THREAD' }), []);

  const openAgentControl = useCallback((participantId: string) => dispatch({ type: 'OPEN_AGENT_CONTROL', participantId }), []);
  const closeAgentControl = useCallback(() => dispatch({ type: 'CLOSE_AGENT_CONTROL' }), []);

  const setReplyTo = useCallback((item: M11CStreamItem | null) => dispatch({ type: 'SET_REPLY_TO', item }), []);
  const clearReply = useCallback(() => dispatch({ type: 'SET_REPLY_TO', item: null }), []);
  const closeAll = useCallback(() => dispatch({ type: 'CLOSE_ALL' }), []);

  return {
    ...state,
    openDetail,
    closeDetail,
    openEdit,
    closeEdit,
    openThread,
    closeThread,
    openAgentControl,
    closeAgentControl,
    setReplyTo,
    clearReply,
    closeAll,
  };
}
