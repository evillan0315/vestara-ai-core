/**
 * @vestara/api — Media Conference HTTP routes (/api/media/*)
 *
 * Server-side token generation for OpenVidu sessions.
 * Credentials never reach the browser — the API creates sessions
 * and returns ephemeral tokens to the client.
 *
 * Architecture:
 *   UI → /api/media/token → OpenVidu REST API → token → UI connects directly
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-006 Media Conference
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

// ─── OpenVidu Configuration ──────────────────────────────────

function getOpenViduConfig() {
  const url = process.env.OPENVIDU_URL;
  const username = process.env.OPENVIDU_USERNAME;
  const secret = process.env.OPENVIDU_SECRET;

  if (!url || !username || !secret) {
    return null;
  }

  return { url, username, secret };
}

function openViduAuthHeader(username: string, secret: string): string {
  return `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`;
}

// ─── Types ───────────────────────────────────────────────────

interface TokenRequest {
  sessionId?: string;
  displayName?: string;
  publishAudio?: boolean;
  publishVideo?: boolean;
}

// ─── OpenVidu REST helpers ───────────────────────────────────

async function ensureSession(
  config: { url: string; username: string; secret: string },
  sessionId: string,
): Promise<void> {
  const checkRes = await fetch(`${config.url}/openvidu/api/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      Authorization: openViduAuthHeader(config.username, config.secret),
    },
  });

  if (checkRes.ok) {
    return; // Session exists
  }

  const createRes = await fetch(`${config.url}/openvidu/api/sessions`, {
    method: 'POST',
    headers: {
      Authorization: openViduAuthHeader(config.username, config.secret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customSessionId: sessionId,
      mediaMode: 'ROUTED',
    }),
  });

  if (!createRes.ok && createRes.status !== 409) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create session: ${createRes.status} ${errorText}`);
  }
}

async function generateToken(
  config: { url: string; username: string; secret: string },
  sessionId: string,
  displayName: string,
): Promise<string> {
  const res = await fetch(`${config.url}/openvidu/api/tokens`, {
    method: 'POST',
    headers: {
      Authorization: openViduAuthHeader(config.username, config.secret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: sessionId,
      data: displayName,
      role: 'PUBLISHER',
      ttl: 3600, // 1 hour
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to generate token: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

// ─── Route Handler ───────────────────────────────────────────

export async function handleMediaRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/media')) return false;

  const config = getOpenViduConfig();
  if (!config) {
    json(res, 503, { error: 'Media conference not configured' });
    return true;
  }

  // POST /api/media/token — generate a connection token
  if (method === 'POST' && p === '/api/media/token') {
    try {
      const body = await readBody(req);
      const parsed: TokenRequest = body ? (JSON.parse(body) as TokenRequest) : {};
      const sessionId = parsed.sessionId ?? `vestara-meet-${Date.now()}`;
      const displayName = parsed.displayName ?? 'Participant';

      await ensureSession(config, sessionId);
      const token = await generateToken(config, sessionId, displayName);

      json(res, 200, {
        token,
        sessionId,
        serverUrl: config.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
    }
    return true;
  }

  // GET /api/media/sessions — list active sessions
  if (method === 'GET' && p === '/api/media/sessions') {
    try {
      const sessionsRes = await fetch(`${config.url}/openvidu/api/sessions`, {
        method: 'GET',
        headers: {
          Authorization: openViduAuthHeader(config.username, config.secret),
        },
      });

      if (!sessionsRes.ok) {
        throw new Error(`Failed to list sessions: ${sessionsRes.status}`);
      }

      const data = (await sessionsRes.json()) as { content: { id: string }[] };
      const sessions = data.content.map((s) => ({
        id: s.id,
        url: `${config.url}/openvidu/api/sessions/${s.id}`,
      }));

      json(res, 200, { sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
    }
    return true;
  }

  // GET /api/media/health — check OpenVidu connectivity
  if (method === 'GET' && p === '/api/media/health') {
    try {
      const healthRes = await fetch(`${config.url}/openvidu/api/sessions`, {
        method: 'GET',
        headers: {
          Authorization: openViduAuthHeader(config.username, config.secret),
        },
      });

      json(res, healthRes.ok ? 200 : 502, {
        configured: true,
        serverUrl: config.url,
        reachable: healthRes.ok,
      });
    } catch {
      json(res, 502, {
        configured: true,
        serverUrl: config.url,
        reachable: false,
      });
    }
    return true;
  }

  return false;
}
