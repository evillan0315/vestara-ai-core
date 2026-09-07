/**
 * @vestara/openvidu-adapter — OpenVidu 2.25 API Types
 *
 * Native OpenVidu REST API request/response types.
 * These are INTERNAL to the adapter — never exported beyond the package boundary.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-002 Native OpenVidu Adapter
 */

// ─── Configuration ───────────────────────────────────────────────

export interface OpenViduConfig {
  /** Base URL (e.g. "https://viduk.swinglifestyle.com") */
  readonly url: string;

  /** API base path (e.g. "/openvidu/api") */
  readonly apiBase: string;

  /** Basic Auth username */
  readonly username: string;

  /** Basic Auth secret */
  readonly secret: string;

  /** Request timeout in ms (default 10000) */
  readonly timeoutMs?: number;
}

// ─── Session API ─────────────────────────────────────────────────

export interface OpenViduCreateSessionRequest {
  readonly customSessionId?: string;
  readonly recordingMode?: 'ALWAYS' | 'MANUAL';
  readonly defaultRecordingProperties?: Record<string, unknown>;
  readonly mediaNode?: string;
  readonly data?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface OpenViduSessionResponse {
  readonly id: string;
  readonly sessionId: string;
  readonly customSessionId?: string;
  readonly createdAt?: number;
  readonly mediaServer?: {
    readonly id?: string;
    readonly url?: string;
  };
  readonly recording?: boolean;
  readonly activeConnections?: number;
  readonly connections?: {
    readonly numberOfElements: number;
  };
  readonly metadata?: Record<string, unknown>;
}

// ─── Connection API ──────────────────────────────────────────────

export type OpenViduRole = 'SUBSCRIBER' | 'PUBLISHER' | 'MODERATOR';

export interface OpenViduCreateConnectionRequest {
  readonly role?: OpenViduRole;
  readonly data?: string;
  readonly record?: boolean;
  readonly allowedFilters?: string[];
  readonly metadata?: Record<string, unknown>;
}

export interface OpenViduConnectionResponse {
  readonly id: string;
  readonly connectionId: string;
  readonly sessionId: string;
  readonly role: OpenViduRole;
  readonly token: string;
  readonly createdAt?: number;
  readonly record?: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly serverData?: string;
}

// ─── Error API ───────────────────────────────────────────────────

export interface OpenViduErrorResponse {
  readonly error?: string;
  readonly message?: string;
  readonly code?: number;
  readonly name?: string;
  readonly status?: number;
}

// ─── API Path Constants ──────────────────────────────────────────

/**
 * Frozen native OpenVidu 2.25 paths.
 * Do NOT use plural /connections — the singular /connection is correct.
 */
export const OPENVIDU_PATHS = {
  sessions: '/sessions',
  sessionById: (id: string) => `/sessions/${encodeURIComponent(id)}`,
  connection: (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}/connection`,
  connectionById: (sessionId: string, connectionId: string) =>
    `/sessions/${encodeURIComponent(sessionId)}/connection/${encodeURIComponent(connectionId)}`,
} as const;
