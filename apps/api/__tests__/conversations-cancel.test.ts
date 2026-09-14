/**
 * Explicit Stop — POST /api/conversations/:id/cancel.
 *
 * Proves the server cancellation contract:
 * - cancel with no in-flight turn → {cancelled:false} (idempotent unknown)
 * - cancel fires ONLY the matching conversation's signal (targeting)
 * - repeated cancel while registered is safe (AbortController no-op refire)
 * - after release (turn settled) → {cancelled:false}
 * - non-POST does not claim the route
 * - disconnect-adjacent behaviour: the endpoint never fires on its own;
 *   only an explicit POST triggers a signal (no auto-cancel anywhere here)
 */

import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  cancelTurn,
  handleConversationsRoute,
  registerTurnController,
  releaseTurnController,
} from '../src/routes/conversations.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(method: string, url: string): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = {};
  return req;
}

const ctx = {} as unknown as WorkspaceContext;

async function postCancel(id: string): Promise<{ handled: boolean; status: number; body: unknown }> {
  const { res, body, status } = fakeResponse();
  const handled = await handleConversationsRoute(
    'POST',
    `/api/conversations/${encodeURIComponent(id)}/cancel`,
    fakeRequest('POST', `/api/conversations/${encodeURIComponent(id)}/cancel`),
    res,
    ctx,
    3001,
    new URL(`http://127.0.0.1:3001/api/conversations/${encodeURIComponent(id)}/cancel`),
  );
  return { handled, status: status(), body: body() };
}

describe('POST /api/conversations/:id/cancel — explicit Stop', () => {
  it('unknown id with no in-flight turn → cancelled:false (idempotent unknown)', async () => {
    const result = await postCancel('conv-nobody-here');
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      cancelled: false,
      reason: 'no_inflight_turn',
      conversationId: 'conv-nobody-here',
    });
  });

  it('fires ONLY the matching conversation signal (targeting)', async () => {
    const other = new AbortController();
    const target = new AbortController();
    registerTurnController('conv-other', other);
    registerTurnController('conv-target', target);
    try {
      const result = await postCancel('conv-target');
      expect(result.body).toEqual({ cancelled: true, conversationId: 'conv-target' });
      expect(target.signal.aborted).toBe(true);
      expect(other.signal.aborted).toBe(false);
    } finally {
      releaseTurnController('conv-other', other);
      releaseTurnController('conv-target', target);
    }
  });

  it('repeated cancel while registered is safe; after release → false', async () => {
    const controller = new AbortController();
    registerTurnController('conv-repeat', controller);
    try {
      const first = await postCancel('conv-repeat');
      const second = await postCancel('conv-repeat');
      expect(first.body).toEqual({ cancelled: true, conversationId: 'conv-repeat' });
      expect(second.body).toEqual({ cancelled: true, conversationId: 'conv-repeat' });
      expect(controller.signal.aborted).toBe(true);
    } finally {
      releaseTurnController('conv-repeat', controller);
    }
    const after = await postCancel('conv-repeat');
    expect(after.body).toEqual({ cancelled: false, reason: 'no_inflight_turn', conversationId: 'conv-repeat' });
  });

  it('release only removes the matching controller (stale-release safe)', () => {
    const first = new AbortController();
    const second = new AbortController();
    registerTurnController('conv-stale', first);
    registerTurnController('conv-stale', second); // newer turn replaces
    releaseTurnController('conv-stale', first); // stale release must not clear
    expect(cancelTurn('conv-stale')).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(first.signal.aborted).toBe(false);
    releaseTurnController('conv-stale', second);
    expect(cancelTurn('conv-stale')).toBe(false);
  });

  it('non-POST does not claim the cancel route', async () => {
    const { res } = fakeResponse();
    const handled = await handleConversationsRoute(
      'GET',
      '/api/conversations/conv-x/cancel',
      fakeRequest('GET', '/api/conversations/conv-x/cancel'),
      res,
      ctx,
      3001,
      new URL('http://127.0.0.1:3001/api/conversations/conv-x/cancel'),
    );
    expect(handled).toBe(false);
  });
});
