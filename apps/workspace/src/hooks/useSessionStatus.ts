/**
 * GA-STATE-001: Session Status Hook
 *
 * Fetches OpenCode session status from `/api/opencode/session/status`
 * and returns a map of session IDs to their derived view status.
 *
 * Authority: OpenCode server is the single source of truth for session state.
 * This hook observes; it does not own or modify session state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenCodeSessionViewStatus } from '../lib/opencode';
import { deriveSessionStatus } from '../lib/opencode';

export type SessionStatusMap = Record<string, OpenCodeSessionViewStatus>;

/**
 * Derive the runtime status for a specific session ID from the status map.
 * Returns 'unknown' if the session is not in the map.
 */
export function resolveSessionRuntimeStatus(
  statusMap: SessionStatusMap,
  sessionId: string | undefined,
): OpenCodeSessionViewStatus {
  if (!sessionId) return 'unknown';
  return statusMap[sessionId] ?? 'unknown';
}

/**
 * Polls `/api/opencode/session/status` at the given interval and returns
 * the current status map. Does not poll when `enabled` is false.
 */
export function useSessionStatus(options?: {
  /** Poll interval in ms. Default: 5000 (matches Sessions page). */
  intervalMs?: number;
  /** Whether to enable polling. Default: true. */
  enabled?: boolean;
}): { statusMap: SessionStatusMap; loading: boolean } {
  const intervalMs = options?.intervalMs ?? 5000;
  const enabled = options?.enabled ?? true;

  const [statusMap, setStatusMap] = useState<SessionStatusMap>({});
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/opencode/session/status', { signal });
      if (!res.ok) return;
      const data = await res.json() as { status?: Record<string, { type?: string }> };
      const raw = data.status ?? {};
      const map: SessionStatusMap = {};
      for (const [id, info] of Object.entries(raw)) {
        map[id] = deriveSessionStatus(info.type);
      }
      setStatusMap(map);
    } catch {
      // Network error or abort — keep previous statusMap
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    const controller = new AbortController();
    abortRef.current = controller;
    fetchStatus(controller.signal);

    // Poll
    const id = setInterval(() => fetchStatus(), intervalMs);

    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [enabled, intervalMs, fetchStatus]);

  return { statusMap, loading };
}
