/**
 * Shared file-operations channel (FILES-PAGE-001).
 *
 * The Files workspace owns the single useFileOperations controller and
 * registers it here; the Operations page (OpsCenter) renders the same
 * operation state (FileOperationsBar) without creating a second command
 * layer. When nothing is registered, consumers see an idle controller.
 * State shape only — filesystem authority stays in FilesystemRuntime.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { UseFileOperationsReturn } from '../features/files/hooks/useFileOperations';

const IDLE_STATE = { status: 'idle' } as const;

function noopResult(): Promise<boolean> {
  return Promise.resolve(false);
}

const IDLE_OPS: UseFileOperationsReturn = {
  state: IDLE_STATE,
  dismiss: () => undefined,
  create: noopResult,
  rename: noopResult,
  duplicate: noopResult,
  move: noopResult,
  remove: noopResult,
  download: noopResult,
  approve: noopResult,
  reject: noopResult,
};

interface FileOperationsChannel {
  /** Currently registered controller, or null when Files is not mounted. */
  readonly ops: UseFileOperationsReturn | null;
  register: (ops: UseFileOperationsReturn) => void;
  unregister: () => void;
}

const FileOperationsContext = createContext<FileOperationsChannel | null>(null);

export function FileOperationsProvider({ children }: { children: ReactNode }) {
  const [ops, setOps] = useState<UseFileOperationsReturn | null>(null);
  const register = useCallback((next: UseFileOperationsReturn) => setOps(next), []);
  const unregister = useCallback(() => setOps(null), []);
  const value = useMemo(() => ({ ops, register, unregister }), [ops, register, unregister]);
  return <FileOperationsContext.Provider value={value}>{children}</FileOperationsContext.Provider>;
}

/** Registered controller, or null outside the Files workspace lifetime. */
export function useFileOperationsChannel(): FileOperationsChannel {
  const ctx = useContext(FileOperationsContext);
  if (!ctx) throw new Error('useFileOperationsChannel must be used within FileOperationsProvider');
  return ctx;
}

/** Display-ready controller: registered instance, or an idle fallback. */
export function useSharedFileOps(): UseFileOperationsReturn {
  return useFileOperationsChannel().ops ?? IDLE_OPS;
}
