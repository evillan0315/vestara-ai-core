import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { CodexAppServerClient } from '../src';

describe('CodexAppServerClient', () => {
  let server: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (typeof address === 'string' || address === null) throw new Error('expected TCP address');
    url = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('initializes, sends initialized, starts a thread, and streams notifications', async () => {
    const receivedMethods: string[] = [];
    server.on('connection', (socket) => {
      let initialized = false;
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as { id?: number; method: string; params?: unknown };
        receivedMethods.push(message.method);
        if (message.method === 'initialize') {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                userAgent: 'vestara-test',
                codexHome: '/tmp/codex',
                platformFamily: 'unix',
                platformOs: 'linux',
              },
            }),
          );
          return;
        }
        if (message.method === 'initialized') {
          initialized = true;
          return;
        }
        if (message.method === 'thread/start') {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                thread: { id: 'thread-1', status: { type: 'idle' } },
                model: 'gpt-test',
              },
            }),
          );
          socket.send(
            JSON.stringify({
              method: 'thread/started',
              params: { thread: { id: 'thread-1' } },
              emittedAtMs: 1,
            }),
          );
          return;
        }
        if (message.method === 'thread/turns/list') {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                data: [{ id: 'turn-1', status: 'completed', itemsView: 'summary' }],
                nextCursor: null,
                backwardsCursor: null,
              },
            }),
          );
          return;
        }
        if (message.method === 'thread/items/list') {
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                data: [{ type: 'agentMessage', id: 'msg-1', text: 'Hello.' }],
                nextCursor: null,
                backwardsCursor: null,
              },
            }),
          );
          return;
        }
        if (message.method === 'turn/start') {
          expect(initialized).toBe(true);
          socket.send(JSON.stringify({ id: message.id, result: { turn: { id: 'turn-1' } } }));
          socket.send(
            JSON.stringify({
              method: 'turn/completed',
              params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
              emittedAtMs: 2,
            }),
          );
        }
      });
    });

    const client = new CodexAppServerClient({ config: { appServerUrl: url, requestTimeoutMs: 1_000 } });
    const notifications: string[] = [];
    client.onNotification((notification) => notifications.push(notification.method));

    const initialized = await client.initialize({ name: 'vestara-test-client', version: 'test' });
    const thread = await client.startThread();
    const turn = await client.startTextTurn(thread.thread.id, 'Say hello in one sentence.');
    const turns = await client.listThreadTurns({ threadId: thread.thread.id });
    const items = await client.listThreadItems({
      threadId: thread.thread.id,
      turnId: turn.turn?.id,
      itemsView: 'full',
    });

    expect(initialized.userAgent).toBe('vestara-test');
    expect(thread.thread.id).toBe('thread-1');
    expect(turn.turn?.id).toBe('turn-1');
    expect(turns.data[0]?.id).toBe('turn-1');
    expect(items.data[0]).toEqual({ type: 'agentMessage', id: 'msg-1', text: 'Hello.' });
    expect(receivedMethods).toEqual([
      'initialize',
      'initialized',
      'thread/start',
      'turn/start',
      'thread/turns/list',
      'thread/items/list',
    ]);
    expect(notifications).toEqual(['thread/started', 'turn/completed']);

    await client.close();
  });
});
