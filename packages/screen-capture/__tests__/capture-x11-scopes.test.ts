import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const {
  X11DisplayAdapter,
  checkX11RegionBackend,
  checkX11WindowBackend,
  cropImage,
  decodeXwd,
  encodePng,
  getDisplayBounds,
  isValidWindowToken,
  selectWindowInteractively,
  validateRegionGeometry,
  verifyWindow,
} = require('../dist/index.js');

const _HEX64 = 'c'.repeat(64);
const AGENT = { actorType: 'agent', actorId: 'vestara-developer' };
const GRANT = { grantedBy: 'm3a-operator', grantedAt: '2026-09-16T00:00:00.000Z' };

function authorized(target: unknown, scope: string) {
  return { target, requestedBy: AGENT, purpose: 'm3a test', authorization: { ...GRANT, scope } };
}

/** Parameterized BE XWD fixture: ZPixmap 32bpp TrueColor, solid color. */
function xwdImage(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const header = Buffer.alloc(100);
  const u32 = (offset: number, value: number) => header.writeUInt32BE(value, offset);
  u32(0, 100);
  u32(4, 7);
  u32(8, 2);
  u32(12, 24);
  u32(16, width);
  u32(20, height);
  u32(24, 0);
  u32(28, 1);
  u32(32, 32);
  u32(36, 0);
  u32(40, 8);
  u32(44, 32);
  u32(48, width * 4);
  u32(52, 4);
  u32(56, 0x00ff0000);
  u32(60, 0x0000ff00);
  u32(64, 0x000000ff);
  u32(68, 8);
  u32(72, 0);
  u32(76, 0);
  u32(80, width);
  u32(84, height);
  u32(88, 0);
  u32(92, 0);
  u32(96, 0);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels.writeUInt32BE((rgb[0] << 16) + (rgb[1] << 8) + rgb[2], i * 4);
  }
  return new Uint8Array(Buffer.concat([header, pixels]));
}

interface StubRoutes {
  idWindow?: { windowId: string; width: number; height: number } | 'stale';
  rootBounds?: { width: number; height: number } | 'fail';
  selectWindow?: string | 'cancel';
  xwdImage?: Uint8Array | 'fail';
}

function stubExec(routes: StubRoutes) {
  return async (file: string, args: readonly string[]) => {
    const base = path.basename(file);
    if (base === 'xwininfo') {
      if (args.includes('-id')) {
        if (routes.idWindow === undefined || routes.idWindow === 'stale') throw new Error('BadWindow');
        const w = routes.idWindow;
        return {
          stdout: `xwininfo: Window id: ${w.windowId}\n  Width: ${w.width}\n  Height: ${w.height}\n`,
          stderr: '',
        };
      }
      if (args.includes('-root')) {
        if (routes.rootBounds === undefined || routes.rootBounds === 'fail') throw new Error('no bounds');
        return {
          stdout: `Width: ${routes.rootBounds.width}\nHeight: ${routes.rootBounds.height}\n`,
          stderr: '',
        };
      }
      if (routes.selectWindow === undefined || routes.selectWindow === 'cancel') throw new Error('cancelled');
      return { stdout: `xwininfo: Window id: ${routes.selectWindow}\n  Width: 10\n  Height: 10\n`, stderr: '' };
    }
    if (base === 'xwd') {
      if (routes.xwdImage === undefined || routes.xwdImage === 'fail') throw new Error('xwd failed');
      const outAt = args.indexOf('-out');
      fs.writeFileSync(args[outAt + 1] as string, Buffer.from(routes.xwdImage));
      return { stdout: '', stderr: '' };
    }
    throw new Error(`unexpected tool ${base}`);
  };
}

function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Stub ingest that echoes a digest OF THE ACTUAL BYTES (proves chain integrity). */
function echoIngest(seen: { bytes?: Uint8Array }) {
  return async (input: { bytes: Uint8Array; kind: string; mediaType?: string }) => {
    seen.bytes = input.bytes;
    return {
      ref: digestOf(input.bytes),
      kind: input.kind,
      mediaType: 'image/png',
      size: input.bytes.length,
      producer: 'stub',
      capturedAt: '2026-09-16T00:00:00.000Z',
    };
  };
}

const TEST_ENV = { DISPLAY: ':0', PATH: '/usr/bin', XAUTHORITY: '/tmp/m3a-xauth' };
const TEST_SEAM = {
  existsSync: (p: string) => p === '/tmp/m3a-xauth',
  accessSync: (p: string) => {
    if (p !== '/usr/bin/xwd' && p !== '/usr/bin/xwininfo') throw new Error('not executable');
  },
};

describe('window token validation', () => {
  it('accepts opaque hex ids and rejects anything else', () => {
    expect(isValidWindowToken('0x1a00007')).toBe(true);
    expect(isValidWindowToken('0xABCDEF')).toBe(true);
    expect(isValidWindowToken('Terminal')).toBe(false);
    expect(isValidWindowToken('0x123; rm -rf /')).toBe(false);
    expect(isValidWindowToken('')).toBe(false);
  });
});

describe('verifyWindow', () => {
  it('confirms live windows with OS geometry', async () => {
    const tools = { xwininfoPath: '/usr/bin/xwininfo', exec: stubExec({}), timeoutMs: 5000 };
    await expect(verifyWindow('0x1', ':0', tools)).rejects.toThrowError(/no longer exists/);
    const live = {
      xwininfoPath: '/usr/bin/xwininfo',
      exec: stubExec({ idWindow: { windowId: '0x1a00007', width: 800, height: 600 } }),
      timeoutMs: 5000,
    };
    await expect(verifyWindow('0x1a00007', ':0', live)).resolves.toEqual({
      windowId: '0x1a00007',
      width: 800,
      height: 600,
    });
  });
});

describe('selectWindowInteractively', () => {
  const tools = (selectWindow?: string | 'cancel') => ({
    xwininfoPath: '/usr/bin/xwininfo',
    exec: stubExec({ selectWindow }),
    timeoutMs: 5000,
  });

  it('returns the user-clicked window and maps dismissal to cancelled', async () => {
    await expect(selectWindowInteractively(':0', tools('0xabc'))).resolves.toEqual({
      status: 'selected',
      windowId: '0xabc',
    });
    await expect(selectWindowInteractively(':0', tools('cancel'))).resolves.toEqual({ status: 'cancelled' });
    await expect(selectWindowInteractively(':0', tools())).resolves.toEqual({ status: 'cancelled' });
  });
});

describe('region geometry validation', () => {
  const bounds = { width: 1920, height: 1080 };

  it('accepts in-bounds explicit geometry', () => {
    expect(validateRegionGeometry({ x: 0, y: 0, width: 1920, height: 1080 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('rejects non-finite, zero-area, and out-of-bounds selections', () => {
    expect(() => validateRegionGeometry(undefined, bounds)).toThrowError(/explicit OS-selected geometry/);
    expect(() => validateRegionGeometry({ x: NaN, y: 0, width: 10, height: 10 }, bounds)).toThrowError(/finite/);
    expect(() => validateRegionGeometry({ x: 0, y: 0, width: 0, height: 10 }, bounds)).toThrowError(/zero area/);
    expect(() => validateRegionGeometry({ x: -1, y: 0, width: 10, height: 10 }, bounds)).toThrowError(/exceeds/);
    expect(() => validateRegionGeometry({ x: 1900, y: 0, width: 100, height: 10 }, bounds)).toThrowError(/exceeds/);
    expect(() => validateRegionGeometry({ x: 0.5, y: 0, width: 10, height: 10 }, bounds)).toThrowError(/integer/);
  });

  it('reads live bounds without capturing', async () => {
    const tools = {
      xwininfoPath: '/usr/bin/xwininfo',
      exec: stubExec({ rootBounds: { width: 1920, height: 1080 } }),
      timeoutMs: 5000,
    };
    await expect(getDisplayBounds(':0', tools)).resolves.toEqual({ width: 1920, height: 1080 });
  });
});

describe('cropImage', () => {
  it('crops decoded RGBA to the validated region', () => {
    const image = decodeXwd(xwdImage(4, 2, [9, 9, 9]));
    const cropped = cropImage(image, { x: 1, y: 0, width: 2, height: 2 });
    expect([cropped.width, cropped.height]).toEqual([2, 2]);
    expect([...cropped.rgba]).toEqual([9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255]);
  });
});

describe('adapter window capture', () => {
  function adapter(routes: StubRoutes, seen: { bytes?: Uint8Array }, env = TEST_ENV) {
    return new X11DisplayAdapter({
      env,
      seam: TEST_SEAM,
      exec: stubExec(routes),
      xwdPath: '/usr/bin/xwd',
      xwininfoPath: '/usr/bin/xwininfo',
      ingest: echoIngest(seen),
    });
  }

  it('captures a verified window end to end with digest correctness', async () => {
    const seen: { bytes?: Uint8Array } = {};
    const states: string[] = [];
    const a = adapter(
      { idWindow: { windowId: '0x1a00007', width: 800, height: 600 }, xwdImage: xwdImage(4, 4, [1, 2, 3]) },
      seen,
    );
    a.onStateChanged((_id, state) => states.push(state));
    const artifact = await a.requestScreenshot(authorized({ kind: 'window', windowToken: '0x1a00007' }, 'window'));
    expect(artifact.kind).toBe('screenshot');
    expect(artifact.mediaType).toBe('image/png');
    expect(artifact.ref).toBe(digestOf(seen.bytes as Uint8Array));
    expect(artifact.captureTarget).toBe('window');
    expect(states).toEqual(['REQUESTED', 'AUTHORIZED', 'SELECTING', 'CAPTURING', 'FINALIZING', 'COMPLETED']);
    expect(JSON.stringify(artifact)).not.toMatch(/tmp|vestara-capture/);
  });

  it('fails stale windows without capturing', async () => {
    const seen: { bytes?: Uint8Array } = {};
    const states: string[] = [];
    const a = adapter({ idWindow: 'stale' }, seen);
    a.onStateChanged((_id, state) => states.push(state));
    await expect(
      a.requestScreenshot(authorized({ kind: 'window', windowToken: '0xdead' }, 'window')),
    ).rejects.toThrowError(/no longer exists/);
    expect(seen.bytes).toBeUndefined();
    expect(states[states.length - 1]).toBe('FAILED');
  });

  it('rejects non-token window ids and scope-mismatched grants', async () => {
    const seen: { bytes?: Uint8Array } = {};
    await expect(
      adapter({}, seen).requestScreenshot(authorized({ kind: 'window', windowToken: 'Terminal' }, 'window')),
    ).rejects.toMatchObject({ code: 'not-supported' });
    await expect(
      adapter({}, seen).requestScreenshot(authorized({ kind: 'window', windowToken: '0x1' }, 'display')),
    ).rejects.toThrowError(/does not cover/);
  });
});

describe('adapter region capture', () => {
  function adapter(routes: StubRoutes, seen: { bytes?: Uint8Array }, env = TEST_ENV) {
    return new X11DisplayAdapter({
      env,
      seam: TEST_SEAM,
      exec: stubExec(routes),
      xwdPath: '/usr/bin/xwd',
      xwininfoPath: '/usr/bin/xwininfo',
      ingest: echoIngest(seen),
    });
  }

  it('captures a validated region with cropped dimensions', async () => {
    const seen: { bytes?: Uint8Array } = {};
    const png = encodePng(4, 4, decodeXwd(xwdImage(4, 4, [7, 7, 7])).rgba);
    const a = adapter({ rootBounds: { width: 1920, height: 1080 }, xwdImage: xwdImage(4, 4, [7, 7, 7]) }, seen);
    const artifact = await a.requestScreenshot(
      authorized({ kind: 'region', regionToken: 'os-r1', geometry: { x: 1, y: 1, width: 2, height: 2 } }, 'region'),
    );
    expect(png.length).toBeGreaterThan(0);
    expect(artifact.ref).toBe(digestOf(seen.bytes as Uint8Array));
    expect(artifact.captureTarget).toBe('region');
    const ihdrWidth = Buffer.from(seen.bytes as Uint8Array).readUInt32BE(16);
    const ihdrHeight = Buffer.from(seen.bytes as Uint8Array).readUInt32BE(20);
    expect([ihdrWidth, ihdrHeight]).toEqual([2, 2]);
  });

  it('rejects geometry-free and out-of-bounds regions before capture', async () => {
    const seen: { bytes?: Uint8Array } = {};
    const routes = { rootBounds: { width: 1920, height: 1080 }, xwdImage: xwdImage(2, 2, [1, 1, 1]) };
    await expect(
      adapter(routes, seen).requestScreenshot(authorized({ kind: 'region', regionToken: 'os-r1' }, 'region')),
    ).rejects.toMatchObject({ code: 'not-supported' });
    await expect(
      adapter(routes, seen).requestScreenshot(
        authorized(
          { kind: 'region', regionToken: 'os-r1', geometry: { x: 1900, y: 0, width: 100, height: 10 } },
          'region',
        ),
      ),
    ).rejects.toThrowError(/exceeds/);
    expect(seen.bytes).toBeUndefined();
  });
});

describe('per-scope probe independence', () => {
  const seam = { existsSync: () => true, accessSync: () => undefined };

  it('does not infer window/region support from display support', async () => {
    const env = { DISPLAY: ':0', PATH: '/usr/bin', XAUTHORITY: '/xauth' };
    const failingRoot = async (file: string, args: readonly string[]) => {
      if (path.basename(file) === 'xwininfo' && args.includes('-root')) throw new Error('no bounds');
      return { stdout: '', stderr: '' };
    };
    const window = await checkX11WindowBackend(env, { seam, exec: failingRoot });
    const region = await checkX11RegionBackend(env, { seam, exec: failingRoot });
    expect(window.usable).toBe(true);
    expect(region.usable).toBe(false);
  });
});

describe('no enumeration authority', () => {
  it('exposes no window enumeration through the canonical contracts', () => {
    const keys = Object.keys(require('../dist/index.js'));
    const hits = keys.filter((key) => /enumerat|querytree|windowlist|listall|walktree|children/i.test(key));
    expect(hits).toEqual([]);
    expect(keys).not.toContain('listWindows');
  });

  it('adapter instances expose no enumeration methods', () => {
    const a = new X11DisplayAdapter({ ingest: echoIngest({}) });
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(a));
    expect(names.filter((n) => /enumerat|querytree|windowlist|listall|tree|children/i.test(n))).toEqual([]);
  });
});
