/**
 * GA-TERM-001 Phase 3 — server-backed terminal sessions.
 *
 * Session ids are server-issued (`POST /api/terminal/sessions`); closing a
 * tab kills the backend session (`DELETE`). Tab state (selection, names)
 * stays local. The socket itself lives in `TerminalWorkspace` (one per
 * active session); this hook owns identity + lifecycle only.
 */

import { useCallback, useState } from 'react';
import type { ProcessStatus, SessionStatus, TerminalSession } from './types';

interface ServerSession {
  id: string;
  cwd: string;
  state: string;
  pid?: number;
}

async function postSession(): Promise<ServerSession> {
  const res = await fetch('/api/terminal/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Create terminal session failed: HTTP ${res.status}`);
  const body = (await res.json()) as { session: ServerSession };
  if (!body.session?.id) throw new Error('Create terminal session failed: malformed response');
  return body.session;
}

async function deleteSession(id: string): Promise<void> {
  try {
    await fetch(`/api/terminal/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Best-effort: the server reaps orphaned sessions via idle timeout.
  }
}

export function useTerminalSessions() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || null;

  const updateSession = useCallback((id: string, patch: Partial<TerminalSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addSession = useCallback(async (): Promise<string | null> => {
    setError(null);
    try {
      const server = await postSession();
      const session: TerminalSession = {
        id: server.id,
        name: 'bash',
        shell: 'bash',
        cwd: server.cwd,
        status: 'connecting',
        processStatus: 'idle',
        createdAt: Date.now(),
      };
      setSessions((prev) => [...prev, session]);
      setActiveId(session.id);
      return session.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create terminal session failed');
      return null;
    }
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      void deleteSession(id);
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
    error,
    addSession,
    removeSession,
    renameSession,
    setActive,
    setSessionStatus,
    setProcessStatus,
    setCwd,
  };
}
