/**
 * useNotifications — React hook for the Notification Center.
 *
 * Fetches notifications from the API on mount and exposes
 * unread count, list, and mark-read operations.
 *
 * Architecture Traceability:
 *   v7.6 — Notification Center & Alerting
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { workspaceSocket } from './ws';

export interface AppNotification {
  id: string;
  type: string;
  category: string;
  message: string;
  actorName: string;
  resourceType: string;
  resourceId: string;
  read: boolean;
  timestamp: string;
  metadata: Record<string, unknown>;
}

import { resolveHttpUrl } from './clientConfig';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(resolveHttpUrl(path), {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { actor } = useAuth();

  const fetchNotifications = useCallback(async () => {
    const data = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>(
      '/notifications?limit=50',
    );
    if (data) {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
    setLoading(false);
  }, []);

  const markRead = useCallback(async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    const data = await apiFetch<{ markedRead: number }>('/notifications/read-all', { method: 'POST' });
    if (data && data.markedRead > 0) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  }, []);

  // Initial fetch + poll every 15s, plus a debounced refetch whenever a
  // relevant live event arrives (toast-worthy events refresh the badge now,
  // not up to 15s later).
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 15_000);
    const off = workspaceSocket.onEvent((event) => {
      if (event.type === 'system.heartbeat' || event.type === 'workflow.updated') return;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void fetchNotifications();
      }, 300);
    });
    return () => {
      off();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [fetchNotifications]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications };
}
