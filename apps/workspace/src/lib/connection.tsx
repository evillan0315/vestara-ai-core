import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { type ConnectionState, workspaceSocket } from './ws';

interface ConnectionSnapshot {
  api: 'ok' | 'down' | 'checking';
  ws: ConnectionState;
  repoPath?: string;
  workspaceStatus?: string;
  lastError?: string;
  refresh: () => void;
}

const ConnectionContext = createContext<ConnectionSnapshot | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [apiState, setApiState] = useState<'ok' | 'down' | 'checking'>('checking');
  const [ws, setWs] = useState<ConnectionState>('closed');
  const [repoPath, setRepoPath] = useState<string>();
  const [workspaceStatus, setWorkspaceStatus] = useState<string>();
  const [lastError, setLastError] = useState<string>();

  const refresh = useCallback(() => {
    setApiState('checking');
    api
      .health()
      .then((h: any) => {
        setApiState('ok');
        setRepoPath(h.repoPath);
        setWorkspaceStatus(h.workspaceStatus);
        setLastError(undefined);
      })
      .catch((err: Error) => {
        setApiState('down');
        setLastError(err.message);
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 10_000);
    workspaceSocket.connect();
    const off = workspaceSocket.onState(setWs);
    return () => {
      window.clearInterval(id);
      off();
      workspaceSocket.disconnect();
    };
  }, [refresh]);

  return (
    <ConnectionContext.Provider value={{ api: apiState, ws, repoPath, workspaceStatus, lastError, refresh }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionSnapshot {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection requires ConnectionProvider');
  return ctx;
}
