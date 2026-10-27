// Live Activity Room client — API first, fixtures as offline fallback.
// Contracts: apps/api/src/routes/activity-room-m11a.ts
// (GET /api/activity-room/v1/snapshot → { participants, stream, complete }).
// The Bearer token rides via assistantFetch (gateway VES-AUTH-001
// authenticates every /api/*); transport failures reject so callers fall
// back to fixtures.

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export interface LiveParticipant {
  id: string;
  name: string;
  presence: string;
  workState: string;
}

export interface LiveStreamItem {
  id: string;
  actor: string;
  content: string;
  timestamp: string;
}

export interface ActivitySnapshot {
  participants: LiveParticipant[];
  stream: LiveStreamItem[];
  complete: boolean;
}

export class ActivityApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ActivityApiError';
    this.status = status;
  }
}

/** Latest-N stream cap — the snapshot can be large; the room shows a window. */
export const ACTIVITY_STREAM_LIMIT = 25;

function normalizeParticipant(raw: {
  participantId?: unknown;
  displayName?: unknown;
  presence?: unknown;
  workState?: unknown;
}): LiveParticipant | null {
  if (typeof raw.participantId !== 'string' || !raw.participantId) return null;
  return {
    id: raw.participantId,
    name: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : raw.participantId,
    presence: typeof raw.presence === 'string' ? raw.presence : 'offline',
    workState: typeof raw.workState === 'string' ? raw.workState : '',
  };
}

function normalizeStreamItem(raw: {
  streamItemId?: unknown;
  actor?: unknown;
  content?: unknown;
  timestamp?: unknown;
}): LiveStreamItem | null {
  if (typeof raw.streamItemId !== 'string' || !raw.streamItemId) return null;
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;
  return {
    id: raw.streamItemId,
    actor: typeof raw.actor === 'string' && raw.actor ? raw.actor : 'system',
    content,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : '',
  };
}

/** GET /api/activity-room/v1/snapshot — Bearer token rides via assistantFetch. */
export async function fetchActivitySnapshot(): Promise<ActivitySnapshot> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/activity-room/v1/snapshot`);
  } catch {
    throw new ActivityApiError(0, 'Activity API unreachable');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the fallback.
    }
    throw new ActivityApiError(res.status, message);
  }
  const data = (await res.json()) as { participants?: unknown; stream?: unknown; complete?: unknown };
  const participants = Array.isArray(data?.participants)
    ? data.participants
        .map((p) => normalizeParticipant((p ?? {}) as Parameters<typeof normalizeParticipant>[0]))
        .filter((p): p is LiveParticipant => p !== null)
    : [];
  const stream = Array.isArray(data?.stream)
    ? data.stream
        .map((s) => normalizeStreamItem((s ?? {}) as Parameters<typeof normalizeStreamItem>[0]))
        .filter((s): s is LiveStreamItem => s !== null)
        .slice(0, ACTIVITY_STREAM_LIMIT)
    : [];
  return { participants, stream, complete: data?.complete !== false };
}

/** Compact relative age for stream timestamps ('' when unparseable). */
export function formatStreamAge(timestamp: string, nowMs = Date.now()): string {
  const then = Date.parse(timestamp);
  if (!timestamp || Number.isNaN(then)) return '';
  const diffMs = Math.max(0, nowMs - then);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
