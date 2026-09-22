/**
 * GA-RETRY-001: scheduled retry for failed Global Assistant turns.
 *
 * Persists a `once` schedule via POST /api/schedules and fires the local
 * retry when the instant arrives. Server-side `run-due` replays
 * assistant-retry tasks for reload survival; the client timer covers the
 * panel-open case. Presentation only — ConversationService owns messages,
 * the schedules API owns durability.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface AssistantRetryTask {
  kind: 'assistant-retry';
  conversationId: string;
  clientTurnId: string;
  message: string;
  provider?: string;
  model?: string;
  assistantRuntime?: 'opencode' | 'codex';
}

export interface ScheduledRetry {
  id: string;
  conversationId: string;
  clientTurnId: string;
  nextRunAt: string;
}

interface SchedulesResponse {
  schedules?: Array<{
    id: string;
    agentId?: string;
    agent_id?: string;
    task: string;
    nextRunAt?: string;
    next_run_at?: string;
  }>;
}

function parseAssistantRetry(task: string): AssistantRetryTask | null {
  try {
    const parsed = JSON.parse(task) as Partial<AssistantRetryTask>;
    if (parsed.kind === 'assistant-retry' && parsed.conversationId && parsed.clientTurnId && parsed.message) {
      return parsed as AssistantRetryTask;
    }
    return null;
  } catch {
    return null;
  }
}

export function useScheduledRetry(options?: {
  onDue?: (retry: ScheduledRetry, task: AssistantRetryTask) => void;
  pollMs?: number;
}) {
  const [retries, setRetries] = useState<ScheduledRetry[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDueRef = useRef(options?.onDue);
  onDueRef.current = options?.onDue;
  const firedRef = useRef(new Set<string>());
  const pollMs = options?.pollMs ?? 30_000;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (!res.ok) return;
      const data = (await res.json()) as SchedulesResponse;
      const next: ScheduledRetry[] = [];
      for (const s of data.schedules ?? []) {
        const task = parseAssistantRetry(s.task);
        if (!task) continue;
        next.push({
          id: s.id,
          conversationId: task.conversationId,
          clientTurnId: task.clientTurnId,
          nextRunAt: s.nextRunAt ?? s.next_run_at ?? '',
        });
      }
      setRetries(next);
    } catch {
      // Best-effort — scheduled retry is additive, never blocks manual Retry.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  // Fire local retries when their instant arrives.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const r of retries) {
      if (firedRef.current.has(r.id)) continue;
      const delay = new Date(r.nextRunAt).getTime() - Date.now();
      if (Number.isNaN(delay)) continue;
      if (delay <= 0) {
        firedRef.current.add(r.id);
        void fetch('/api/schedules/run-due', { method: 'POST' }).catch(() => {});
        continue;
      }
      const t = setTimeout(() => {
        firedRef.current.add(r.id);
        void fetch('/api/schedules/run-due', { method: 'POST' }).catch(() => {});
      }, Math.min(delay, 2_147_483_647));
      timers.push(t);
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [retries]);

  // Surface due retries to the caller (ConversationPanel triggers retryTurn).
  useEffect(() => {
    const now = Date.now();
    for (const r of retries) {
      if (firedRef.current.has(`${r.id}:surfaced`)) continue;
      const at = new Date(r.nextRunAt).getTime();
      if (!Number.isNaN(at) && at <= now) {
        firedRef.current.add(`${r.id}:surfaced`);
        // Re-read the full task for the callback.
        void fetch('/api/schedules')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const found = (data?.schedules ?? []).find((s: { id: string }) => s.id === r.id);
            const task = found ? parseAssistantRetry(found.task) : null;
            if (task) onDueRef.current?.(r, task);
          })
          .catch(() => {});
      }
    }
  }, [retries]);

  const scheduleRetry = useCallback(async (task: AssistantRetryTask, retryAtISO: string) => {
    setScheduling(true);
    setError(null);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `ga-retry-${task.clientTurnId}`,
          agentId: 'global-assistant',
          task: JSON.stringify(task),
          frequency: 'once',
          nextRunAt: retryAtISO,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule retry');
    } finally {
      setScheduling(false);
    }
  }, [refresh]);

  const cancelRetry = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel retry');
    }
  }, [refresh]);

  return useMemo(
    () => ({ retries, scheduling, error, scheduleRetry, cancelRetry, refresh }),
    [retries, scheduling, error, scheduleRetry, cancelRetry, refresh],
  );
}
