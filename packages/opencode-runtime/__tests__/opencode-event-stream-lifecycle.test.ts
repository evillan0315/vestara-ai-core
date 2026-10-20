import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { OpenCodeHttpClient } from '../src/client/opencode-http-client';
import { resolveOpenCodeConfig } from '../src/config';

/**
 * OpenCode SSE lifecycle contract.
 *
 * The OpenCode server registers one event listener per `/event` connection and
 * releases it only when the response scope ends — i.e. when the client
 * disconnects. A client that abandons an SSE stream without cancelling the
 * response body leaves the socket established, so the server keeps the
 * listener registered. Eleven such connections trip Node's
 * MaxListenersExceededWarning inside the OpenCode server:
 *
 *   MaxListenersExceededWarning: Possible EventTarget memory leak detected.
 *   11 event listeners added to [yZ].
 *
 * These tests pin the transport behaviour that prevents it: an abandoned or
 * aborted stream must close the upstream connection.
 */
interface SseTestServer {
  readonly server: Server;
  readonly baseUrl: string;
  readonly opened: number;
  readonly closed: number;
}

async function startSseServer(): Promise<SseTestServer> {
  const state = { opened: 0, closed: 0 };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    state.opened += 1;
    const timer = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'server.heartbeat' })}\n\n`);
    }, 50);
    const finish = () => {
      clearInterval(timer);
      state.closed += 1;
    };
    req.on('close', finish);
    res.on('close', finish);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`data: ${JSON.stringify({ type: 'server.connected' })}\n\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    get opened() {
      return state.opened;
    },
    get closed() {
      return state.closed;
    },
  };
}

function createClient(baseUrl: string): OpenCodeHttpClient {
  return new OpenCodeHttpClient(
    resolveOpenCodeConfig({
      baseUrl,
      password: 'test-password',
      requestTimeoutMs: 5_000,
    }),
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

const servers: SseTestServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
});

describe('OpenCode event stream transport lifecycle', () => {
  it('closes the upstream connection when the consumer abandons the stream', async () => {
    const server = await startSseServer();
    servers.push(server);
    const client = createClient(server.baseUrl);

    const stream = client.openEventStream({ workspaceId: 'workspace-1', directory: '/repo' });
    for await (const event of stream) {
      expect(event.type).toBe('server.connected');
      break; // the consumer stops reading — the transport must still close
    }

    expect(await waitFor(() => server.closed >= 1)).toBe(true);
  });

  it('closes the upstream connection when the caller aborts the stream', async () => {
    const server = await startSseServer();
    servers.push(server);
    const client = createClient(server.baseUrl);
    const controller = new AbortController();

    const stream = client.openEventStream({ workspaceId: 'workspace-1', directory: '/repo' }, controller.signal);
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    controller.abort();
    await iterator.next().catch(() => undefined);

    expect(await waitFor(() => server.closed >= 1)).toBe(true);
  });

  it('releases the connection of every abandoned stream (no listener accumulation)', async () => {
    const server = await startSseServer();
    servers.push(server);
    const client = createClient(server.baseUrl);

    // Twelve abandoned streams — one more than the OpenCode server's
    // MaxListeners threshold (11) for its per-connection event listener.
    for (let index = 0; index < 12; index += 1) {
      const stream = client.openEventStream({ workspaceId: 'workspace-1', directory: '/repo' });
      for await (const event of stream) {
        expect(event.type).toBe('server.connected');
        break;
      }
    }

    expect(await waitFor(() => server.closed >= 12)).toBe(true);
    expect(server.opened).toBe(12);
  });
});
