import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type OpenCodeMessageSummary, type OpenCodeSessionDetail, openCodeApi } from '../../lib/opencode';
import { isEventForSession, OpenCodeStreamClient } from '../../lib/opencode-events';
import { OpenCodeSessionDeleteDialog } from './OpenCodeSessionDeleteDialog';
import { OpenCodeAbortDialog } from './session/OpenCodeAbortDialog';
import { OpenCodeActivityFeed } from './session/OpenCodeActivityFeed';
import { type OpenCodeComposerStatus, OpenCodeMessageComposer } from './session/OpenCodeMessageComposer';
import { OpenCodeSessionHeader } from './session/OpenCodeSessionHeader';
import { OpenCodeSessionLifecycle } from './session/OpenCodeSessionLifecycle';
import { normalizeActivityEvent, type OpenCodeActivityEvent } from './session/openCodeEventNormalizer';
import { INITIAL_LIVE_STATE, openCodeSessionReducer } from './session/openCodeSessionReducer';

export function OpenCodeSessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<OpenCodeSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [abortOpen, setAbortOpen] = useState(false);
  const [abortPending, setAbortPending] = useState(false);
  const [abortError, setAbortError] = useState<string | null>(null);
  const [composerStatus, setComposerStatus] = useState<OpenCodeComposerStatus>('ready');
  const [composerError, setComposerError] = useState<string | null>(null);

  const [live, dispatch] = useReducer(openCodeSessionReducer, INITIAL_LIVE_STATE);
  const streamRef = useRef<OpenCodeStreamClient | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // ── Initial snapshot: REST is the source of truth. ─────────────
  const loadSnapshot = useCallback(async (): Promise<OpenCodeActivityEvent[]> => {
    const [detail, messages] = await Promise.all([openCodeApi.session(sessionId), openCodeApi.messages(sessionId)]);
    setSession(detail);
    setNotFound(detail === null);
    setLoading(false);
    // Seed the feed with confirmed message history.
    const seeded: OpenCodeActivityEvent[] = (messages ?? []).map((message: OpenCodeMessageSummary, index) => ({
      id: message.id ?? `msg-hist-${index}-${message.createdAt ?? ''}`,
      type: 'opencode.message.history',
      kind: 'message' as const,
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      text: message.text,
      timestamp: message.createdAt ?? new Date().toISOString(),
      sessionId,
      agentId: message.agent,
    }));
    dispatch({ type: 'reconcile', events: seeded, active: detail?.status === 'active' });
    return seeded;
  }, [sessionId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // ── Event stream: incremental updates only, filtered by session. ─
  useEffect(() => {
    const stream = new OpenCodeStreamClient({
      onStatus: (status) => dispatch({ type: 'stream-status', status }),
      onEvent: (envelope) => {
        if (!isEventForSession(envelope, sessionIdRef.current)) return;
        const event = normalizeActivityEvent(envelope);
        if (event) dispatch({ type: 'event', event });
      },
      onError: () => {
        /* stream errors are surfaced via status transitions */
      },
    });
    streamRef.current = stream;
    stream.open();

    // Reconcile with REST when the connection returns.
    const reconcileOnReconnect = () => {
      if (stream.currentStatus === 'connected') {
        void loadSnapshot();
      }
    };
    const onReconnect = () => reconcileOnReconnect();
    // Poll REST as a backstop for missed events.
    const interval = setInterval(() => {
      if (stream.currentStatus !== 'connected') return;
      void openCodeApi.messages(sessionIdRef.current).then((messages) => {
        const seeded: OpenCodeActivityEvent[] = (messages ?? []).map((message: OpenCodeMessageSummary, index) => ({
          id: message.id ?? `msg-hist-${index}-${message.createdAt ?? ''}`,
          type: 'opencode.message.history',
          kind: 'message' as const,
          role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
          text: message.text,
          timestamp: message.createdAt ?? new Date().toISOString(),
          sessionId: sessionIdRef.current,
          agentId: message.agent,
        }));
        dispatch({ type: 'reconcile', events: seeded, active: true });
      });
    }, 10_000);

    window.addEventListener('focus', onReconnect);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onReconnect);
      stream.close();
      streamRef.current = null;
    };
  }, [loadSnapshot]);

  // ── Mutations: only update after backend confirmation. ─────────
  const handleSend = async (text: string) => {
    setComposerStatus('submitting');
    setComposerError(null);
    const ok = await openCodeApi.sendMessage(sessionId, text);
    if (ok) {
      setComposerStatus('submitted');
      await loadSnapshot();
      setComposerStatus('ready');
    } else {
      setComposerStatus('failed');
      setComposerError('Message send failed. The session may no longer be writable.');
    }
  };

  const handleAbort = async () => {
    setAbortPending(true);
    setAbortError(null);
    const ok = await openCodeApi.abortSession(sessionId);
    setAbortPending(false);
    if (ok) {
      dispatch({ type: 'abort-confirmed' });
      setAbortOpen(false);
      setComposerStatus('disabled-terminal');
      await loadSnapshot();
    } else {
      setAbortError('Abort failed. The session was not aborted.');
    }
  };

  const handleDelete = async () => {
    setDeletePending(true);
    setDeleteError(null);
    const ok = await openCodeApi.deleteSession(sessionId);
    setDeletePending(false);
    if (ok) {
      navigate('/opencode/sessions');
    } else {
      setDeleteError('Delete failed. The session may no longer exist.');
    }
  };

  const active =
    session?.status === 'active' ||
    live.lifecycle.some((entry) => entry.stage === 'execution' && entry.status === 'active');

  if (loading) {
    return (
      <div className="p-6 text-center text-[11px] text-(--vestara-text-muted) animate-pulse">Loading session…</div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => navigate('/opencode/sessions')}
            className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
            aria-label="Back to sessions"
          >
            <ArrowBackRoundedIcon fontSize="inherit" className="text-[16px]" />
          </button>
          <h1 className="text-lg font-bold text-(--vestara-text)">Session Not Found</h1>
        </div>
        <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-[11px] text-(--vestara-text-muted)">
          This session does not exist or was deleted upstream.
        </div>
      </div>
    );
  }

  const streamDisconnected = live.streamStatus === 'disconnected' || live.streamStatus === 'reconnecting';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate('/opencode/sessions')}
          className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
          aria-label="Back to sessions"
        >
          <ArrowBackRoundedIcon fontSize="inherit" className="text-[16px]" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 hover:text-red-300 cursor-pointer"
        >
          <DeleteRoundedIcon fontSize="inherit" /> Delete
        </button>
      </div>

      <OpenCodeSessionHeader
        session={session}
        streamStatus={live.streamStatus}
        active={active}
        onAbort={() => setAbortOpen(true)}
      />

      {streamDisconnected && (
        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="text-[12px] font-medium text-amber-400">Live updates interrupted</div>
          <p className="text-[11px] text-(--vestara-text-muted) mt-0.5">
            The OpenCode session may still be running. Vestara is reconnecting and will reconcile the session state when
            the connection returns.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-1">
          <OpenCodeSessionLifecycle lifecycle={live.lifecycle} outcome={live.outcome} aborted={live.aborted} />
        </div>
        <div className="lg:col-span-2">
          <OpenCodeActivityFeed
            events={live.events}
            followLive={live.followLive}
            unseenEventCount={live.unseenEventCount}
            onFollowChange={(follow) => dispatch({ type: 'follow', follow })}
            onJumpToLatest={() => dispatch({ type: 'jump-to-latest' })}
          />
        </div>
      </div>

      <div className="mt-3">
        <OpenCodeMessageComposer
          status={composerStatus}
          error={composerError}
          onSubmit={(text) => void handleSend(text)}
        />
      </div>

      {abortOpen && (
        <OpenCodeAbortDialog
          pending={abortPending}
          error={abortError}
          onConfirm={() => void handleAbort()}
          onCancel={() => {
            setAbortOpen(false);
            setAbortError(null);
          }}
        />
      )}

      {deleteOpen && (
        <OpenCodeSessionDeleteDialog
          sessionTitle={session.title}
          pending={deletePending}
          error={deleteError}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
