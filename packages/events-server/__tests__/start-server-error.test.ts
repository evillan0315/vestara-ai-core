/**
 * Regression guard: a port conflict must not crash the host process.
 *
 * `server.listen` failures (EADDRINUSE) are emitted asynchronously as an
 * 'error' event on the http.Server — not thrown — so a caller's try/catch
 * cannot observe them. With no listener Node crashes the process on the
 * unhandled 'error' event. That is the crash that aborted `vestara open` when
 * the dev API already held port 3001.
 */

import * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startServer } from '../src/index';

function listenOnEphemeralPort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

describe('startServer error handling', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    servers.length = 0;
    vi.restoreAllMocks();
  });

  it('handles EADDRINUSE instead of crashing the process', async () => {
    const blocker = http.createServer();
    servers.push(blocker);
    const port = await listenOnEphemeralPort(blocker);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const conflicting = startServer(port);
    servers.push(conflicting);

    const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
      conflicting.once('error', resolve);
    });

    // Reaching this line at all proves the 'error' event was handled: with no
    // listener Node would have thrown and crashed the test process.
    expect(error.code).toBe('EADDRINUSE');
    expect(conflicting.listenerCount('error')).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });
});
