/**
 * VES-UI-001 T6: Terminal Package Data Hook
 *
 * Live surface over the governed terminal backend:
 *   sessions → `GET /api/terminal/sessions` (create via `POST`)
 *   streaming → `/ws/terminal?sessionId=…` (`{op:'input'}` → `{op:'stdout'|'stderr'|'exit'|'error'}`)
 * Falls back to `terminalPackageFixture` (snapshot transcript) when the API
 * is unreachable. Never hardcoded arrays in JSX — components render this
 * hook's output.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 Terminal live surface)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveWsUrl } from '../../../lib/clientConfig';
import {
  terminalPackageFixture,
  type TerminalPackageLine,
  type TerminalPackageSession,
} from './packages.fixtures';

export interface UseTerminalPackageReturn {
  readonly sessions: readonly TerminalPackageSession[];
  readonly activeId: string | null;
  readonly lines: readonly TerminalPackageLine[];
  readonly isLoading: boolean;
  readonly isLive: boolean;
  readonly connected: boolean;
  readonly error: string | null;
  readonly createSession: () => Promise<void>;
  readonly selectSession: (id: string) => void;
  readonly send: (command: string) => void;
}

interface ServerSession {
  readonly id: string;
  readonly cwd?: string;
}

const MAX_LINES = 200;

function toSession(raw: { id?: unknown; cwd?: unknown; name?: unknown; shell?: unknown }): TerminalPackageSession | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'bash',
    shell: typeof raw.shell === 'string' && raw.shell ? raw.shell : 'bash',
    cwd: typeof raw.cwd === 'string' && raw.cwd ? raw.cwd : 'workspace',
  };
}

export function useTerminalPackage(): UseTerminalPackageReturn {
  const [sessions, setSessions] = useState<readonly TerminalPackageSession[]>(terminalPackageFixture.sessions);
  const [activeId, setActiveId] = useState<string | null>(terminalPackageFixture.sessions[0]?.id ?? null);
  const [lines, setLines] = useState<readonly TerminalPackageLine[]>(terminalPackageFixture.transcript);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lineSeq = useRef(terminalPackageFixture.transcript.length);
  const wsRef = useRef<WebSocket | null>(null);

  const append = useCallback((kind: TerminalPackageLine['kind'], text: string) => {
    lineSeq.current += 1;
    const id = `t-live-${lineSeq.current}`;
    setLines((prev) => [...prev.slice(-MAX_LINES + 1), { id, kind, text }]);
  }, []);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/terminal/sessions', { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { sessions?: unknown };
      const live = Array.isArray(body.sessions)
        ? (body.sessions as Array<{ id?: unknown; cwd?: unknown; name?: unknown; shell?: unknown }>)
            .map(toSession)
            .filter((entry): entry is TerminalPackageSession => entry !== null)
        : [];
      if (live.length > 0) {
        setSessions(live);
        setActiveId((current) => (current && live.some((s) => s.id === current) ? current : live[0]?.id ?? null));
        setIsLive(true);
      } else {
        setSessions(terminalPackageFixture.sessions);
        setActiveId(terminalPackageFixture.sessions[0]?.id ?? null);
        setIsLive(false);
      }
    } catch (err) {
      setSessions(terminalPackageFixture.sessions);
      setActiveId(terminalPackageFixture.sessions[0]?.id ?? null);
      setIsLive(false);
      setError(err instanceof Error ? err.message : 'Terminal sessions unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { session?: ServerSession };
      if (!body.session?.id) throw new Error('Malformed session response');
      const session: TerminalPackageSession = {
        id: body.session.id,
        name: 'bash',
        shell: 'bash',
        cwd: body.session.cwd ?? 'workspace',
      };
      setSessions((prev) =>
        prev.some((entry) => entry.id === session.id) ? prev : [...prev.filter((entry) => entry.id !== terminalPackageFixture.sessions[0]?.id || prev.length > 1), session],
      );
      setActiveId(session.id);
      setIsLive(true);
      setError(null);
      append('status', `Session ${session.id} created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create terminal session failed');
    }
  }, [append]);

  const selectSession = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  // Live streaming for the active server session; the snapshot fixture id
  // never opens a socket (offline transcript only).
  useEffect(() => {
    const snapshotId = terminalPackageFixture.sessions[0]?.id;
    if (!activeId || !isLive || activeId === snapshotId || typeof WebSocket === 'undefined') {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }
    let cancelled = false;
    const ws = new WebSocket(resolveWsUrl(`/ws/terminal?sessionId=${encodeURIComponent(activeId)}`));
    wsRef.current = ws;
    ws.onopen = () => {
      if (!cancelled) setConnected(true);
    };
    ws.onclose = () => {
      if (cancelled) return;
      if (wsRef.current === ws) wsRef.current = null;
      setConnected(false);
    };
    ws.onerror = () => {
      if (!cancelled) setConnected(false);
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(String(ev.data)) as { op?: unknown; text?: unknown; error?: unknown; code?: unknown };
        if ((msg.op === 'stdout' || msg.op === 'stderr') && typeof msg.text === 'string' && msg.text) {
          append('output', msg.text);
        } else if (msg.op === 'exit') {
          const code = typeof msg.code === 'number' ? msg.code : 0;
          append('status', `Session ended · exit ${code}`);
          setConnected(false);
        } else if (msg.op === 'error' && typeof msg.error === 'string' && msg.error) {
          append('status', msg.error);
        }
      } catch {
        /* malformed frame — ignore */
      }
    };
    return () => {
      cancelled = true;
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [activeId, isLive, append]);

  const send = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      append('input', `$ ${trimmed}`);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'input', data: `${trimmed}\n` }));
      } else {
        append('output', 'Snapshot session — connect the API for live execution.');
      }
    },
    [append],
  );

  return { sessions, activeId, lines, isLoading, isLive, connected, error, createSession, selectSession, send };
}
