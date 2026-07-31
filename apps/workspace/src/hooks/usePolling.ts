/**
 * Generic polling hook for live data.
 *
 * Polls `fn` every `intervalMs` until `paused`; exposes refresh/lastUpdated.
 * Errors are swallowed and reported so the UI can degrade gracefully.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePolling<T>(fn: () => Promise<T | null>, intervalMs: number, paused = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const result = await fnRef.current();
      if (result !== null) {
        setData(result);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
      setUpdatedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (paused || intervalMs <= 0) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [paused, intervalMs, refresh]);

  return { data, error, loading, updatedAt, refresh };
}
