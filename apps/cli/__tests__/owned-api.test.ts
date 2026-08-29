import { afterEach, describe, expect, it } from 'vitest';
import { OwnedApiProcess } from '../src/lib/owned-api.js';

const CHILDREN: OwnedApiProcess[] = [];

function spawnLongRunning(): OwnedApiProcess {
  const child = new OwnedApiProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {});
  CHILDREN.push(child);
  return child;
}

afterEach(() => {
  for (const child of CHILDREN.splice(0)) child.kill();
});

describe('OwnedApiProcess', () => {
  it('spawns a child process', () => {
    const child = spawnLongRunning();
    expect(child.pid).toBeTypeOf('number');
    expect(child.exited).toBe(false);
  });

  it('kills the child on kill()', async () => {
    const child = spawnLongRunning();
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(child.exited).toBe(true);
  });

  it('detaches listeners without killing the child', async () => {
    const child = spawnLongRunning();
    child.detach();
    // detach() must not terminate the child by itself.
    expect(child.exited).toBe(false);
    // A subsequent explicit kill still works.
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(child.exited).toBe(true);
  });
});
