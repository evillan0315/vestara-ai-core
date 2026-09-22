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

/** A workspace file staged as a composer attachment (saved, path-addressable). */
export interface ComposerFileAttachment {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

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
  /** Terminal drawer — bottom large drawer for terminal access. */
  readonly terminalDrawerOpen: boolean;
  /** Terminal drawer dock edge — bottom, top, or right. */
  readonly terminalDrawerPosition: 'bottom' | 'top' | 'right';
  /** Files drawer — file browser panel for the Activity Room. */
  readonly filesDrawerOpen: boolean;
  /** Files drawer dock edge — flips left ↔ right on toolbar toggle. */
  readonly filesDrawerPosition: 'left' | 'right';
  /** Settings drawer — display preferences for the Activity Room. */
  readonly settingsDrawerOpen: boolean;
  /** Settings drawer dock edge — flips right ↔ left on toolbar toggle. */
  readonly settingsDrawerPosition: 'right' | 'left';
  /** File attachments staged in the composer (e.g. screenshots saved to Files). */
  readonly attachedFiles: readonly ComposerFileAttachment[];
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
  | { readonly type: 'ADD_FILE_ATTACHMENT'; readonly attachment: ComposerFileAttachment }
  | { readonly type: 'REMOVE_FILE_ATTACHMENT'; readonly id: string }
  | { readonly type: 'CLEAR_FILE_ATTACHMENTS' }
  | { readonly type: 'CLOSE_ALL' }
  | { readonly type: 'TOGGLE_TERMINAL_DRAWER' }
  | { readonly type: 'CYCLE_TERMINAL_DRAWER' }
  | { readonly type: 'DOCK_TERMINAL_DRAWER'; readonly position: 'bottom' | 'top' | 'right' }
  | { readonly type: 'TOGGLE_FILES_DRAWER' }
  | { readonly type: 'CYCLE_FILES_DRAWER' }
  | { readonly type: 'TOGGLE_SETTINGS_DRAWER' }
  | { readonly type: 'CYCLE_SETTINGS_DRAWER' };

const INITIAL_STATE: ActivityRoomUIState = {
  detailItem: null,
  editingItem: null,
  threadActivityIds: [],
  agentControlParticipantId: undefined,
  replyToItem: null,
  terminalDrawerOpen: false,
  terminalDrawerPosition: 'bottom',
  filesDrawerOpen: false,
  filesDrawerPosition: 'left',
  settingsDrawerOpen: false,
  settingsDrawerPosition: 'right',
  attachedFiles: [],
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

    case 'ADD_FILE_ATTACHMENT':
      if (state.attachedFiles.some((existing) => existing.id === action.attachment.id)) return state;
      return { ...state, attachedFiles: [...state.attachedFiles, action.attachment] };

    case 'REMOVE_FILE_ATTACHMENT':
      return { ...state, attachedFiles: state.attachedFiles.filter((existing) => existing.id !== action.id) };

    case 'CLEAR_FILE_ATTACHMENTS':
      return state.attachedFiles.length === 0 ? state : { ...state, attachedFiles: [] };

    case 'CLOSE_ALL':
      return INITIAL_STATE;

    case 'TOGGLE_TERMINAL_DRAWER':
      return { ...state, terminalDrawerOpen: !state.terminalDrawerOpen };

    case 'CYCLE_TERMINAL_DRAWER':
      // Toolbar toggle: closed → open docked bottom; open → flip the dock
      // edge (stays open, session survives — no remount).
      if (!state.terminalDrawerOpen) return { ...state, terminalDrawerOpen: true, terminalDrawerPosition: 'bottom' };
      return {
        ...state,
        terminalDrawerPosition: state.terminalDrawerPosition === 'bottom' ? 'top' : 'bottom',
      };

    case 'DOCK_TERMINAL_DRAWER':
      return { ...state, terminalDrawerOpen: true, terminalDrawerPosition: action.position };

    case 'TOGGLE_FILES_DRAWER':
      return { ...state, filesDrawerOpen: !state.filesDrawerOpen };

    case 'CYCLE_FILES_DRAWER':
      // Toolbar toggle: closed → open docked left; open → flip the dock
      // edge left ↔ right (stays open, browser state survives — no remount).
      if (!state.filesDrawerOpen) return { ...state, filesDrawerOpen: true, filesDrawerPosition: 'left' };
      return {
        ...state,
        filesDrawerPosition: state.filesDrawerPosition === 'left' ? 'right' : 'left',
      };

    case 'TOGGLE_SETTINGS_DRAWER':
      return { ...state, settingsDrawerOpen: !state.settingsDrawerOpen };

    case 'CYCLE_SETTINGS_DRAWER':
      // Toolbar toggle: closed → open docked right; open → flip the dock
      // edge right ↔ left (stays open, draft state survives — no remount).
      if (!state.settingsDrawerOpen) return { ...state, settingsDrawerOpen: true, settingsDrawerPosition: 'right' };
      return {
        ...state,
        settingsDrawerPosition: state.settingsDrawerPosition === 'right' ? 'left' : 'right',
      };

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
  const addFileAttachment = useCallback(
    (attachment: ComposerFileAttachment) => dispatch({ type: 'ADD_FILE_ATTACHMENT', attachment }),
    [],
  );
  const removeFileAttachment = useCallback((id: string) => dispatch({ type: 'REMOVE_FILE_ATTACHMENT', id }), []);
  const clearFileAttachments = useCallback(() => dispatch({ type: 'CLEAR_FILE_ATTACHMENTS' }), []);
  const closeAll = useCallback(() => dispatch({ type: 'CLOSE_ALL' }), []);
  const toggleTerminalDrawer = useCallback(() => dispatch({ type: 'TOGGLE_TERMINAL_DRAWER' }), []);
  const cycleTerminalDrawer = useCallback(() => dispatch({ type: 'CYCLE_TERMINAL_DRAWER' }), []);
  const dockTerminalDrawer = useCallback(
    (position: 'bottom' | 'top' | 'right') => dispatch({ type: 'DOCK_TERMINAL_DRAWER', position }),
    [],
  );
  const toggleFilesDrawer = useCallback(() => dispatch({ type: 'TOGGLE_FILES_DRAWER' }), []);
  const cycleFilesDrawer = useCallback(() => dispatch({ type: 'CYCLE_FILES_DRAWER' }), []);
  const toggleSettingsDrawer = useCallback(() => dispatch({ type: 'TOGGLE_SETTINGS_DRAWER' }), []);
  const cycleSettingsDrawer = useCallback(() => dispatch({ type: 'CYCLE_SETTINGS_DRAWER' }), []);

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
    addFileAttachment,
    removeFileAttachment,
    clearFileAttachments,
    closeAll,
    toggleTerminalDrawer,
    cycleTerminalDrawer,
    dockTerminalDrawer,
    toggleFilesDrawer,
    cycleFilesDrawer,
    toggleSettingsDrawer,
    cycleSettingsDrawer,
  };
}
