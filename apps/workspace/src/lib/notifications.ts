/**
 * useNotifications — React hook for the Notification Center.
 *
 * Notification service is disabled. The hook returns empty state immediately
 * without making API calls or polling. markRead/markAllRead are no-ops.
 *
 * Architecture Traceability:
 *   v7.6 — Notification Center & Alerting (disabled)
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';

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
  const { actor } = useAuth();

  const fetchNotifications = useCallback(async () => {
    // Notification service disabled — return empty state without hitting the API.
    setNotifications([]);
    setUnreadCount(0);
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

  // Notification service disabled — no polling or WebSocket listeners needed.
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications };
}
