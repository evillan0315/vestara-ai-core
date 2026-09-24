import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FileMutationExecutionDetail } from '@vestara/shared';

export type GlobalDrawerSurface = 'assistant' | 'terminal' | 'files';
export type GlobalDrawerPosition = 'left' | 'right' | 'bottom' | 'top';

export interface GlobalDrawerState {
  readonly activeSurface: GlobalDrawerSurface;
  readonly open: boolean;
  readonly terminalPosition: GlobalDrawerPosition;
  readonly filesPosition: 'left' | 'right';
  readonly filesPath: string | null;
  readonly filesEdit: FileMutationExecutionDetail | null;
}

export interface GlobalDrawerApi extends GlobalDrawerState {
  openDrawer: (surface: GlobalDrawerSurface, request?: { readonly path?: string }) => void;
  toggleDrawer: (surface: Exclude<GlobalDrawerSurface, 'assistant'>) => void;
  closeDrawer: () => void;
  dockTerminal: (position: GlobalDrawerPosition) => void;
  dockFiles: (position: 'left' | 'right') => void;
  openFilesAt: (path: string) => void;
  inspectFileEdit: (detail: FileMutationExecutionDetail) => void;
  registerActivityAttachmentHandler: (
    handler: ((attachment: { readonly id: string; readonly name: string; readonly path: string }) => void) | null,
  ) => void;
  attachFileToActivityComposer: (attachment: { readonly id: string; readonly name: string; readonly path: string }) => void;
}

type ActivityFileAttachment = { readonly id: string; readonly name: string; readonly path: string };

const GlobalDrawerContext = createContext<GlobalDrawerApi | null>(null);

export function GlobalDrawerProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<GlobalDrawerState>({
    activeSurface: 'assistant',
    open: false,
    terminalPosition: 'bottom',
    filesPosition: 'left',
    filesPath: null,
    filesEdit: null,
  });
  const activityAttachmentHandler = useRef<((attachment: ActivityFileAttachment) => void) | null>(null);

  const openDrawer = useCallback((surface: GlobalDrawerSurface, request?: { readonly path?: string }) => {
    setState((current) => ({
      ...current,
      activeSurface: surface,
      open: true,
      filesPath: surface === 'files' && request?.path ? request.path : current.filesPath,
      filesEdit: surface === 'files' && request?.path ? null : current.filesEdit,
    }));
  }, []);

  const toggleDrawer = useCallback((surface: Exclude<GlobalDrawerSurface, 'assistant'>) => {
    setState((current) =>
      current.activeSurface === surface && current.open
        ? { ...current, open: false }
        : { ...current, activeSurface: surface, open: true },
    );
  }, []);

  const closeDrawer = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  const dockTerminal = useCallback((position: GlobalDrawerPosition) => setState((current) => ({ ...current, terminalPosition: position })), []);
  const dockFiles = useCallback((position: 'left' | 'right') => setState((current) => ({ ...current, filesPosition: position })), []);
  const openFilesAt = useCallback((path: string) => openDrawer('files', { path }), [openDrawer]);
  const inspectFileEdit = useCallback((detail: FileMutationExecutionDetail) => {
    setState((current) => ({ ...current, activeSurface: 'files', open: true, filesPath: detail.file, filesEdit: detail }));
  }, []);
  const registerActivityAttachmentHandler = useCallback<GlobalDrawerApi['registerActivityAttachmentHandler']>((handler) => {
    activityAttachmentHandler.current = handler;
  }, []);
  const attachFileToActivityComposer = useCallback((attachment: { readonly id: string; readonly name: string; readonly path: string }) => {
    activityAttachmentHandler.current?.(attachment);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.getAttribute('role') === 'textbox';
      if (typing) return;

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleDrawer('files');
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === '`') {
        event.preventDefault();
        toggleDrawer('terminal');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleDrawer]);

  const value = useMemo<GlobalDrawerApi>(() => ({
    ...state,
    openDrawer,
    toggleDrawer,
    closeDrawer,
    dockTerminal,
    dockFiles,
    openFilesAt,
    inspectFileEdit,
    registerActivityAttachmentHandler,
    attachFileToActivityComposer,
  }), [state, openDrawer, toggleDrawer, closeDrawer, dockTerminal, dockFiles, openFilesAt, inspectFileEdit, registerActivityAttachmentHandler, attachFileToActivityComposer]);

  return <GlobalDrawerContext.Provider value={value}>{children}</GlobalDrawerContext.Provider>;
}

export function useGlobalDrawer(): GlobalDrawerApi {
  const context = useContext(GlobalDrawerContext);
  if (!context) throw new Error('useGlobalDrawer requires GlobalDrawerProvider');
  return context;
}
