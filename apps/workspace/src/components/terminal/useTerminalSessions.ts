import { useCallback, useRef, useState } from 'react';
import type { TerminalSession, SessionStatus, ProcessStatus } from './types';

let sessionCounter = 0;
function genId(): string {
  return `term-${Date.now()}-${++sessionCounter}`;
}

export function useTerminalSessions() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || null;

  const updateSession = useCallback((id: string, patch: Partial<TerminalSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addSession = useCallback((shell = 'bash', cwd = '~'): string => {
    const id = genId();
    const session: TerminalSession = {
      id,
      name: shell,
      shell,
      cwd,
      status: 'connecting',
      processStatus: 'idle',
      createdAt: Date.now(),
    };
    setSessions((prev) => [...prev, session]);
    setActiveId(id);
    return id;
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (activeId === id) setActiveId(next[next.length - 1]?.id || null);
        return next;
      });
    },
    [activeId],
  );

  const renameSession = useCallback(
    (id: string, name: string) => {
      updateSession(id, { name });
    },
    [updateSession],
  );

  const setActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const setSessionStatus = useCallback(
    (id: string, status: SessionStatus) => {
      updateSession(id, { status });
    },
    [updateSession],
  );

  const setProcessStatus = useCallback(
    (id: string, processStatus: ProcessStatus, exitCode?: number) => {
      updateSession(id, { processStatus, exitCode });
    },
    [updateSession],
  );

  const setCwd = useCallback(
    (id: string, cwd: string) => {
      updateSession(id, { cwd });
    },
    [updateSession],
  );

  return {
    sessions,
    activeId,
    activeSession,
    addSession,
    removeSession,
    renameSession,
    setActive,
    setSessionStatus,
    setProcessStatus,
    setCwd,
  };
}
