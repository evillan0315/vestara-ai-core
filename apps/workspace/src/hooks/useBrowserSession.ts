/**
 * useBrowserSession — Live Browser session hook.
 *
 * Creates a governed browser session on mount, subscribes to browser.* WS
 * events, and exposes action methods (navigate/back/forward/reload/screenshot/
 * take-control). Screenshots are opt-in — call refreshScreenshot() to capture
 * the current viewport on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BrowserActionResult,
  type BrowserSessionInfo,
  type BrowserState,
  browserBack,
  browserClose,
  browserCreateSession,
  browserForward,
  browserNavigate,
  browserReload,
  browserReturnControl,
  browserScreenshot,
  browserState,
  browserTakeControl,
  voiceIntent,
} from '../lib/browser-client';
import { workspaceSocket } from '../lib/ws';

export type BrowserConnectionStatus = 'connecting' | 'live' | 'human' | 'offline' | 'unconfigured';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: string;
  source: 'voice' | 'browser';
}

export type TimelineStatus = 'active' | 'done' | 'waiting' | 'error';

export interface TimelineEntry {
  id: string;
  label: string;
  timestamp: string;
  status: TimelineStatus;
  detail?: string;
}

export function useBrowserSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<BrowserSessionInfo | null>(null);
  const [url, setUrl] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<BrowserConnectionStatus>('connecting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const entryCounter = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  const pushTranscript = useCallback((text: string, source: 'voice' | 'browser') => {
    setTranscript((prev) => [
      ...prev,
      { id: `t-${++entryCounter.current}`, text, timestamp: new Date().toISOString(), source },
    ]);
  }, []);

  const pushTimeline = useCallback((label: string, status: TimelineStatus, detail?: string): string => {
    const id = `tl-${++entryCounter.current}`;
    setTimeline((prev) => [...prev, { id, label, timestamp: new Date().toISOString(), status, detail }]);
    return id;
  }, []);

  const updateTimeline = useCallback((id: string, status: TimelineStatus, detail?: string) => {
    setTimeline((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, status, ...(detail ? { detail } : {}) } : entry)),
    );
  }, []);

  const refreshScreenshot = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return null;
    const res = await browserScreenshot(id);
    if (res.ok && res.data?.dataUrl) {
      setScreenshot(res.data.dataUrl);
      if (res.data.url) setUrl(res.data.url);
    }
    return res;
  }, []);

  // ─── Create session on mount ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await browserCreateSession();
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 400 && res.error?.includes('not configured')) {
          setStatus('unconfigured');
        } else {
          setStatus('offline');
          setError(res.error ?? 'Failed to create browser session');
        }
        return;
      }
      const info = res.data;
      if (!info) {
        setStatus('offline');
        setError('Browser session created without session data');
        return;
      }
      sessionIdRef.current = info.sessionId;
      setSessionId(info.sessionId);
      setSessionInfo(info);
      setStatus(info.controlMode === 'human' ? 'human' : 'live');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── WS subscription for browser.* events ─────────────────
  useEffect(() => {
    const off = workspaceSocket.onEvent((evt) => {
      if (!evt.type?.startsWith('browser.')) return;
      const payload = (evt.payload ?? {}) as Record<string, unknown>;
      // Only react to events for this session
      if (payload.sessionId && payload.sessionId !== sessionIdRef.current) return;
      if (evt.type === 'browser.navigation.started' && typeof payload.url === 'string') {
        pushTranscript(`Navigating to ${payload.url}`, 'browser');
        pushTimeline(`Navigating to ${payload.url}`, 'waiting');
      }
      if (evt.type === 'browser.navigation.completed' && typeof payload.url === 'string') {
        setUrl(payload.url);
        pushTimeline('Page loaded', 'done');
      }
      if (evt.type === 'browser.action.completed') {
        pushTimeline('Action completed', 'done');
      }
      if (evt.type === 'browser.action.failed') {
        pushTimeline('Action failed', 'error', typeof payload.error === 'string' ? payload.error : undefined);
      }
      if (evt.type === 'browser.control.taken') {
        setStatus('human');
      }
      if (evt.type === 'browser.control.returned') {
        setStatus('live');
      }
      if (evt.type === 'browser.session.stopped') {
        setStatus('offline');
        setSessionInfo(null);
      }
    });
    return off;
  }, [pushTimeline, pushTranscript]);

  // ─── Actions ──────────────────────────────────────────────
  const run = useCallback(
    async <T>(fn: (id: string) => Promise<BrowserActionResult<T>>): Promise<BrowserActionResult<T> | null> => {
      const id = sessionIdRef.current;
      if (!id) return null;
      setBusy(true);
      setError(null);
      try {
        const res = await fn(id);
        if (!res.ok) setError(res.error ?? 'Browser action failed');
        return res;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const navigate = useCallback(
    async (target: string): Promise<BrowserActionResult<{ url: string; title: string }> | null> => {
      pushTranscript(`Navigating to ${target}`, 'browser');
      pushTimeline(`Navigating to ${target}`, 'waiting');
      const res = await run((id) => browserNavigate(id, target));
      if (res?.ok && res.data) {
        setUrl(res.data.url);
      } else if (!res) {
        pushTimeline('Action failed', 'error', 'No active session');
      }
      return res;
    },
    [pushTimeline, pushTranscript, run],
  );

  const back = useCallback(() => run((id) => browserBack(id)), [run]);
  const forward = useCallback(() => run((id) => browserForward(id)), [run]);
  const reload = useCallback(() => run((id) => browserReload(id)), [run]);

  const syncState = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    const res = await browserState(id);
    if (res.ok && res.data) {
      setUrl(res.data.url);
      setStatus(res.data.controlMode === 'human' ? 'human' : 'live');
    }
  }, []);

  const toggleControl = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    const isHuman = status === 'human';
    const res = isHuman ? await browserReturnControl(id) : await browserTakeControl(id);
    if (res.ok) {
      setStatus(isHuman ? 'live' : 'human');
    }
  }, [status]);

  const resetSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id) await browserClose(id);
    sessionIdRef.current = null;
    setSessionId(null);
    setSessionInfo(null);
    setUrl('');
    setScreenshot(null);
    setStatus('connecting');
    setError(null);
    const res = await browserCreateSession();
    if (res.ok && res.data) {
      sessionIdRef.current = res.data.sessionId;
      setSessionId(res.data.sessionId);
      setSessionInfo(res.data);
      setStatus('live');
    } else {
      setStatus('offline');
      setError(res.error ?? 'Failed to recreate session');
    }
  }, []);

  /** Execute a voice/text command via /api/voice/intent and refresh the viewport. */
  const voiceCommand = useCallback(
    async (text: string): Promise<{ ok: boolean; error?: string; action?: string }> => {
      const id = sessionIdRef.current;
      if (!id) return { ok: false, error: 'No active browser session' };
      pushTranscript(text, 'voice');
      pushTimeline('Voice detected', 'done');
      pushTimeline(`Transcribed: "${text}"`, 'done');
      const intentId = pushTimeline('Processing intent…', 'active');
      setBusy(true);
      setError(null);
      try {
        const res = await voiceIntent(text, { sessionId: id });
        updateTimeline(intentId, 'done');
        if (!res.ok || !res.data) {
          const message = res.error ?? 'Voice command failed';
          pushTimeline('Command failed', 'error', message);
          setError(message);
          return { ok: false, error: message };
        }
        const { result, action } = res.data;
        const actionType = action?.type ?? 'action';
        if (actionType === 'navigate' && typeof res.data.intent?.params?.url === 'string') {
          const target = res.data.intent.params.url;
          pushTranscript(`Navigating to ${target}`, 'browser');
          pushTimeline(`Navigating to ${target}`, 'waiting');
          setUrl(target);
        } else {
          pushTimeline(`Executing ${actionType}`, 'done');
        }
        if (result.screenshot) {
          setScreenshot(result.screenshot);
          pushTimeline('Captured screenshot', 'done');
        }
        return { ok: result.success, error: result.error, action: action?.type };
      } catch (err) {
        updateTimeline(intentId, 'error');
        const message = err instanceof Error ? err.message : String(err);
        pushTimeline('Command failed', 'error', message);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setBusy(false);
      }
    },
    [pushTimeline, pushTranscript, updateTimeline],
  );

  return {
    sessionId,
    sessionInfo,
    url,
    screenshot,
    status,
    busy,
    error,
    transcript,
    timeline,
    navigate,
    back,
    forward,
    reload,
    refreshScreenshot,
    toggleControl,
    resetSession,
    syncState,
    voiceCommand,
  };
}

export type { BrowserState };
