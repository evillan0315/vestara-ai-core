/**
 * Public screenshot route — path policy tests.
 *
 * /screenshots exists so local captures (e.g. Playwright PNGs) can be shared
 * as URLs with clients that cannot read local scratch paths (Telegram photo
 * URLs via the tunnel). These tests prove the fail-closed contract:
 * - only raster images inside the screenshots dir resolve
 * - traversal, wrong extensions, directories, and missing files are not-found
 * - non-screenshot paths are ignored (never claimed from the SPA fallback)
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveScreenshotFile, serveScreenshots } from '../src/server';

const dir = mkdtempSync(join(tmpdir(), 'vestara-screenshots-test-'));
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
writeFileSync(join(dir, 'overview-configuration.png'), pngBytes);
writeFileSync(join(dir, 'notes.txt'), 'not an image');
writeFileSync(join(dir, 'vector.svg'), '<svg></svg>');
mkdirSync(join(dir, 'nested'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveScreenshotFile', () => {
  it('resolves a raster image inside the directory', () => {
    const result = resolveScreenshotFile('/screenshots/overview-configuration.png', dir);
    expect(result).toEqual({
      status: 'ok',
      filePath: join(dir, 'overview-configuration.png'),
      contentType: 'image/png',
    });
  });

  it('ignores non-screenshot paths', () => {
    expect(resolveScreenshotFile('/api/health', dir)).toEqual({ status: 'ignored' });
    expect(resolveScreenshotFile('/overview', dir)).toEqual({ status: 'ignored' });
  });

  it('blocks path traversal including encoded variants', () => {
    expect(resolveScreenshotFile('/screenshots/../server.ts', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/%2e%2e/server.ts', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/sub/../../server.ts', dir)).toEqual({ status: 'not-found' });
  });

  it('rejects non-image extensions and directories', () => {
    expect(resolveScreenshotFile('/screenshots/notes.txt', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/vector.svg', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/nested', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/', dir)).toEqual({ status: 'not-found' });
  });

  it('returns not-found for missing files and bad escapes', () => {
    expect(resolveScreenshotFile('/screenshots/does-not-exist.png', dir)).toEqual({ status: 'not-found' });
    expect(resolveScreenshotFile('/screenshots/%E0%A4%A.png', dir)).toEqual({ status: 'not-found' });
  });
});

describe('serveScreenshots', () => {
  it('streams image bytes with an image content type', async () => {
    const chunks: Buffer[] = [];
    let status = 0;
    const headers: Record<string, string> = {};
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });
    const res = Object.assign(sink, {
      headersSent: false,
      req: { headers: {} },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      writeHead(code: number, head: Record<string, string>) {
        status = code;
        for (const [name, value] of Object.entries(head)) headers[name.toLowerCase()] = value;
        return res;
      },
    });

    const claimed = serveScreenshots(
      res as unknown as http.ServerResponse,
      '/screenshots/overview-configuration.png',
      dir,
    );
    expect(claimed).toBe(true);
    await new Promise<void>((resolve, reject) => {
      sink.on('finish', () => resolve());
      sink.on('error', (error) => reject(error));
    });
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('image/png');
    expect(headers['content-length']).toBe(String(pngBytes.byteLength));
    expect(Buffer.concat(chunks)).toEqual(pngBytes);
  });
});
