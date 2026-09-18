import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const {
  X11AdapterError,
  X11DisplayAdapter,
  checkX11DisplayBackend,
  decodeXwd,
  encodePng,
  findXwd,
  isValidDisplayId,
  probeScreenCaptureCapabilities,
} = require('../dist/index.js');

const HEX64 = 'b'.repeat(64);

const AGENT = { actorType: 'agent', actorId: 'vestara-developer' };

function authorizedDisplayRequest(displayId = ':0', scope = 'display') {
  return {
    target: { kind: 'display', displayId },
    requestedBy: AGENT,
    purpose: 'm3 test',
    authorization: { grantedBy: 'm3-operator', grantedAt: '2026-09-16T00:00:00.000Z', scope },
  };
}

function stubSeam(existing: readonly string[] = [], executable: readonly string[] = []) {
  return {
    existsSync: (p: string) => existing.includes(p),
    accessSync: (p: string) => {
      if (!executable.includes(p)) throw new Error('not executable');
    },
  };
}

/** Minimal BE XWD: 2x1 ZPixmap, 32bpp TrueColor, no colormap. Pixels: red, green. */
function xwdFixture(): Uint8Array {
  const header = Buffer.alloc(100);
  const u32 = (offset: number, value: number) => header.writeUInt32BE(value, offset);
  u32(0, 100);
  u32(4, 7);
  u32(8, 2);
  u32(12, 24);
  u32(16, 2);
  u32(20, 1);
  u32(24, 0);
  u32(28, 1);
  u32(32, 32);
  u32(36, 0);
  u32(40, 8);
  u32(44, 32);
  u32(48, 8);
  u32(52, 4);
  u32(56, 0x00ff0000);
  u32(60, 0x0000ff00);
  u32(64, 0x000000ff);
  u32(68, 8);
  u32(72, 0);
  u32(76, 0);
  u32(80, 2);
  u32(84, 1);
  u32(88, 0);
  u32(92, 0);
  u32(96, 0);
  const pixels = Buffer.alloc(8);
  pixels.writeUInt32BE(0x00ff0000, 0);
  pixels.writeUInt32BE(0x0000ff00, 4);
  return new Uint8Array(Buffer.concat([header, pixels]));
}

describe('display id validation', () => {
  it('accepts local displays and rejects remote/arbitrary input', () => {
    expect(isValidDisplayId(':0')).toBe(true);
    expect(isValidDisplayId(':0.0')).toBe(true);
    expect(isValidDisplayId('evil; rm -rf /')).toBe(false);
    expect(isValidDisplayId('host:0')).toBe(false);
    expect(isValidDisplayId('')).toBe(false);
  });

  it('finds xwd without a shell', () => {
    expect(findXwd('/nope:/also-nope', stubSeam())).toBeUndefined();
    expect(findXwd('/usr/bin:/bin', stubSeam([], ['/usr/bin/xwd']))).toBe('/usr/bin/xwd');
  });
});

describe('checkX11DisplayBackend', () => {
  const goodEnv = { DISPLAY: ':0', PATH: '/usr/bin', XAUTHORITY: '/home/user/.Xauthority' };
  const goodSeam = stubSeam(['/home/user/.Xauthority'], ['/usr/bin/xwd']);

  it('reports usable only with display + tool + authority', () => {
    const status = checkX11DisplayBackend(goodEnv, goodSeam);
    expect(status.usable).toBe(true);
    expect(status.display).toBe(':0');
  });

  it('proves DISPLAY alone is insufficient', () => {
    const noTool = checkX11DisplayBackend({ DISPLAY: ':0', PATH: '/empty', XAUTHORITY: '/a' }, stubSeam(['/a'], []));
    expect(noTool.usable).toBe(false);
    expect(noTool.reason).toMatch(/xwd/);
  });

  it('fails descriptively without display or authority', () => {
    expect(checkX11DisplayBackend({ PATH: '/usr/bin' }, goodSeam).usable).toBe(false);
    const noAuth = checkX11DisplayBackend(
      { DISPLAY: ':0', PATH: '/usr/bin', XAUTHORITY: '/missing' },
      stubSeam([], ['/usr/bin/xwd']),
    );
    expect(noAuth.usable).toBe(false);
    expect(noAuth.reason).toMatch(/authority/);
  });
});

describe('probe override merge', () => {
  it('flips only backend-verified entries to supported', async () => {
    const result = await probeScreenCaptureCapabilities({ DISPLAY: ':0' }, [
      { operation: 'screenshot', scope: 'display', supported: true, reason: 'x11 backend ready' },
    ]);
    const display = result.capabilities.find((c) => c.operation === 'screenshot' && c.scope === 'display');
    expect(display?.supported).toBe(true);
    expect(result.capabilities.filter((c) => c.supported)).toHaveLength(1);
  });
});

describe('decodeXwd', () => {
  it('decodes ZPixmap TrueColor to RGBA', () => {
    const image = decodeXwd(xwdFixture());
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect([...image.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('fails closed on XYPixmap and truncated input', () => {
    const xypixmap = Buffer.from(xwdFixture());
    xypixmap.writeUInt32BE(1, 8);
    expect(() => decodeXwd(new Uint8Array(xypixmap))).toThrowError(X11AdapterError);
    expect(() => decodeXwd(new Uint8Array([0x1a]))).toThrowError(X11AdapterError);
  });
});

describe('encodePng', () => {
  it('emits a structurally valid PNG whose IDAT round-trips', () => {
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]));
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let offset = 8;
    const chunks = new Map<string, Uint8Array>();
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString('ascii', offset + 4, offset + 8);
      chunks.set(type, new Uint8Array(png.slice(offset + 8, offset + 8 + length)));
      offset += 12 + length;
    }
    const ihdr = Buffer.from(chunks.get('IHDR') as Uint8Array);
    expect(ihdr.readUInt32BE(0)).toBe(2);
    expect(ihdr.readUInt32BE(4)).toBe(1);
    const raw = inflateSync(Buffer.from(chunks.get('IDAT') as Uint8Array));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255]);
    expect(chunks.has('IEND')).toBe(true);
  });
});

describe('adapter authority boundary', () => {
  function adapter(overrides = {}) {
    return new X11DisplayAdapter({
      ingest: async () => ({
        ref: HEX64,
        kind: 'screenshot',
        mediaType: 'image/png',
        size: 10,
        producer: 'stub',
        capturedAt: '2026-09-16T00:00:00.000Z',
      }),
      ...overrides,
    });
  }

  it('rejects unauthorized requests before touching the backend', async () => {
    const bare = { target: { kind: 'display', displayId: ':0' }, requestedBy: AGENT, purpose: 'x' };
    await expect(adapter().requestScreenshot(bare)).rejects.toThrowError(/explicit authorization/);
  });

  it('rejects scope-mismatched grants', async () => {
    await expect(adapter().requestScreenshot(authorizedDisplayRequest(':0', 'window'))).rejects.toThrowError(
      /does not cover/,
    );
  });

  it('rejects window/region targets and all recording operations', async () => {
    const windowReq = {
      ...authorizedDisplayRequest(),
      target: { kind: 'window', windowToken: 't' },
      authorization: { grantedBy: 'op', grantedAt: 't', scope: 'window' },
    };
    await expect(adapter().requestScreenshot(windowReq)).rejects.toMatchObject({ code: 'not-supported' });
    await expect(adapter().startRecording(authorizedDisplayRequest())).rejects.toMatchObject({ code: 'not-supported' });
    await expect(adapter().stopRecording('x')).rejects.toMatchObject({ code: 'not-supported' });
    await expect(adapter().cancel('x')).rejects.toMatchObject({ code: 'not-supported' });
  });

  it('rejects non-local display ids without spawning', async () => {
    await expect(adapter().requestScreenshot(authorizedDisplayRequest('host:0'))).rejects.toMatchObject({
      code: 'not-supported',
    });
  });

  it('cleans temp state when the backend binary is missing', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm3-tmpcheck-'));
    const savedDisplay = process.env.DISPLAY;
    process.env.DISPLAY = ':0';
    try {
      await expect(
        adapter({ xwdPath: '/nonexistent/xwd-zzz', tmpRoot }).requestScreenshot(authorizedDisplayRequest()),
      ).rejects.toMatchObject({ code: 'capture-failed' });
      expect(fs.readdirSync(tmpRoot)).toEqual([]);
    } finally {
      if (savedDisplay === undefined) delete process.env.DISPLAY;
      else process.env.DISPLAY = savedDisplay;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('exposes no audio surface', () => {
    const a = adapter();
    expect('audio' in a).toBe(false);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(a)).some((n) => /audio/i.test(n))).toBe(false);
  });
});
