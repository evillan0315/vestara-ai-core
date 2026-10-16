/**
 * Regression guard: a filesystem watcher 'error' event must degrade to
 * non-watching instead of crashing the host process.
 *
 * `fs.watch` reports failures (notably ENOSPC when the inotify watch/instance
 * limit is reached) asynchronously via the watcher's 'error' event — they are
 * NOT thrown, so a surrounding try/catch cannot observe them. With no listener,
 * Node throws on the unhandled 'error' event and kills the process. That is the
 * crash that aborted `vestara open` when a recursive watcher observed
 * `.vestara/os/boot-state.json.<pid>.tmp`.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { watchMock } = vi.hoisted(() => ({ watchMock: vi.fn() }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, watch: (...args: unknown[]) => watchMock(...args) };
});

import { MonitorService } from '../src/monitor-service';
import { WorkspaceUiWatcher } from '../src/workspace-ui-watcher';
import { WorkspaceWatcher } from '../src/workspace-watcher';

class FakeWatcher extends EventEmitter {
  close = vi.fn();
  unref = vi.fn();
}

function lastWatcher(): FakeWatcher {
  const result = watchMock.mock.results.at(-1)?.value;
  if (!(result instanceof FakeWatcher)) throw new Error('fs.watch was not called');
  return result;
}

const ENOSPC = new Error('ENOSPC: System limit for number of file watchers reached');

beforeEach(() => {
  watchMock.mockReset();
  watchMock.mockImplementation(() => new FakeWatcher());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('watcher error degradation', () => {
  it('MonitorService stops watching instead of crashing', async () => {
    const monitor = new MonitorService({ rootPath: os.tmpdir() } as never, {} as never);
    await monitor.start(() => {});

    expect(monitor.isActive).toBe(true);
    const watcher = lastWatcher();
    expect(watcher.listenerCount('error')).toBe(1);
    expect(() => watcher.emit('error', ENOSPC)).not.toThrow();
    expect(monitor.isActive).toBe(false);
    expect(watcher.close).toHaveBeenCalledTimes(1);
  });

  it('WorkspaceUiWatcher stops watching instead of crashing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-ui-watcher-'));
    fs.mkdirSync(path.join(root, 'apps', 'workspace'), { recursive: true });

    try {
      const uiWatcher = new WorkspaceUiWatcher(root);
      await uiWatcher.start();

      expect(uiWatcher.isActive).toBe(true);
      const watcher = lastWatcher();
      expect(watcher.listenerCount('error')).toBe(1);
      expect(() => watcher.emit('error', ENOSPC)).not.toThrow();
      expect(uiWatcher.isActive).toBe(false);
      expect(watcher.close).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('WorkspaceWatcher stops watching instead of crashing', () => {
    const watcherInstance = new WorkspaceWatcher({ rootDir: os.tmpdir(), index: {} as never });
    watcherInstance.start();

    expect(watcherInstance.isWatching).toBe(true);
    const watcher = lastWatcher();
    expect(watcher.listenerCount('error')).toBe(1);
    expect(() => watcher.emit('error', ENOSPC)).not.toThrow();
    expect(watcherInstance.isWatching).toBe(false);
    expect(watcher.close).toHaveBeenCalledTimes(1);
  });
});
