/**
 * Workspace browser client — drives the governed browser runtime via
 * /api/browser/* and /api/voice/*. Every call returns a normalized
 * { ok, status, data, error } envelope so the UI can surface failures
 * (e.g. "browser runtime not configured").
 */

import { resolveHttpUrl } from './clientConfig';

// ─── Types ────────────────────────────────────────────────────

export interface BrowserSessionInfo {
  sessionId: string;
  status: string;
  controlMode: 'agent' | 'human';
  lastActivityAt: string;
}

export interface BrowserElementRef {
  ref: string;
  role: string;
  name: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  value?: string;
}

export interface BrowserState {
  sessionId: string;
  status: string;
  controlMode: 'agent' | 'human';
  url: string;
}

export interface BrowserScreenshot {
  url: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface BrowserNavigation {
  url: string;
  title: string;
}

export interface BrowserObservation {
  url: string;
  title: string;
  observationId: string;
  elements: BrowserElementRef[];
}

export interface VoiceIntentResult {
  sessionId: string;
  intent: { type: string; confidence: number; rawText: string; params: Record<string, unknown> };
  action: { type: string; [key: string]: unknown };
  result: {
    success: boolean;
    error?: string;
    screenshot?: string;
    extractedText?: string;
    duration: number;
  };
}

export interface BrowserActionResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

// ─── Fetch helper ─────────────────────────────────────────────

async function postBrowser<T>(path: string, body: unknown): Promise<BrowserActionResult<T>> {
  try {
    const res = await fetch(resolveHttpUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      // Normalize both error shapes the API uses: `{ error: string }` (route
      // handlers) and `{ error: { code, message, requestId } }` (error envelope).
      const raw = data?.error;
      const message =
        typeof raw === 'string'
          ? raw
          : typeof raw === 'object' && raw !== null && typeof (raw as { message?: unknown }).message === 'string'
            ? ((raw as { message: string }).message as string)
            : undefined;
      return { ok: false, status: res.status, error: message ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Browser session ──────────────────────────────────────────

export function browserCreateSession(
  ownerId = 'web',
  taskId = 'live',
): Promise<BrowserActionResult<BrowserSessionInfo>> {
  return postBrowser<BrowserSessionInfo>('/api/browser/session', { ownerId, taskId });
}

export function browserState(sessionId: string): Promise<BrowserActionResult<BrowserState>> {
  return postBrowser<BrowserState>('/api/browser/state', { sessionId });
}

export function browserClose(sessionId: string): Promise<BrowserActionResult<{ closed: boolean }>> {
  return postBrowser<{ closed: boolean }>('/api/browser/close', { sessionId });
}

export function browserTakeControl(sessionId: string): Promise<BrowserActionResult<{ controlMode: string }>> {
  return postBrowser<{ controlMode: string }>('/api/browser/take-control', { sessionId });
}

export function browserReturnControl(sessionId: string): Promise<BrowserActionResult<{ controlMode: string }>> {
  return postBrowser<{ controlMode: string }>('/api/browser/return-control', { sessionId });
}

// ─── Browser actions ──────────────────────────────────────────

export function browserNavigate(sessionId: string, url: string): Promise<BrowserActionResult<BrowserNavigation>> {
  return postBrowser<BrowserNavigation>('/api/browser/navigate', { sessionId, url });
}

export function browserObserve(sessionId: string): Promise<BrowserActionResult<BrowserObservation>> {
  return postBrowser<BrowserObservation>('/api/browser/observe', { sessionId });
}

export function browserClick(
  sessionId: string,
  input: { selector?: string; observationId?: string; ref?: string; x?: number; y?: number },
): Promise<BrowserActionResult<{ url: string }>> {
  return postBrowser<{ url: string }>('/api/browser/click', { sessionId, ...input });
}

export function browserType(
  sessionId: string,
  input: { text: string; selector?: string; observationId?: string; ref?: string; submit?: boolean },
): Promise<BrowserActionResult<{ url: string }>> {
  return postBrowser<{ url: string }>('/api/browser/type', { sessionId, ...input });
}

export function browserScroll(
  sessionId: string,
  direction: 'up' | 'down',
  amount?: number,
): Promise<BrowserActionResult<{ scrolled: boolean }>> {
  return postBrowser<{ scrolled: boolean }>('/api/browser/scroll', { sessionId, direction, amount });
}

export function browserBack(sessionId: string): Promise<BrowserActionResult<BrowserNavigation>> {
  return postBrowser<BrowserNavigation>('/api/browser/back', { sessionId });
}

export function browserForward(sessionId: string): Promise<BrowserActionResult<BrowserNavigation>> {
  return postBrowser<BrowserNavigation>('/api/browser/forward', { sessionId });
}

export function browserReload(sessionId: string): Promise<BrowserActionResult<BrowserNavigation>> {
  return postBrowser<BrowserNavigation>('/api/browser/reload', { sessionId });
}

export function browserScreenshot(sessionId: string): Promise<BrowserActionResult<BrowserScreenshot>> {
  return postBrowser<BrowserScreenshot>('/api/browser/screenshot', { sessionId });
}

// ─── Voice ────────────────────────────────────────────────────

export function voiceIntent(
  text: string,
  options: { sessionId?: string; autoApprove?: boolean } = {},
): Promise<BrowserActionResult<VoiceIntentResult>> {
  return postBrowser<VoiceIntentResult>('/api/voice/intent', { text, ...options });
}

/** Transcribe an audio blob (webm) via /api/stt. Returns text or an error. */
export async function sttTranscribe(audio: Blob): Promise<{ text: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('audio', audio, 'recording.webm');
    const res = await fetch(resolveHttpUrl('/api/stt'), { method: 'POST', body: formData });
    const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!res.ok || !data) return { text: '', error: `STT failed (HTTP ${res.status})` };
    if (typeof data.error === 'string' && data.error.length > 0) return { text: data.text ?? '', error: data.error };
    return { text: data.text ?? '' };
  } catch (error) {
    return { text: '', error: error instanceof Error ? error.message : String(error) };
  }
}
