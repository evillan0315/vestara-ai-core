// @vitest-environment node

/**
 * VES-PERF-002 (P1): static Workspace UI asset serving.
 *
 * Guards the transport policy for the app shell: content negotiation
 * (br/gzip/identity), immutable caching for content-hashed assets, no-cache
 * for index.html, and the path-traversal fallback.
 */

import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import * as zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveWorkspaceUi } from '../src/server';

const BIG_JS = `const payload = "${'a'.repeat(6000)}";`;
const INDEX_HTML = '<!doctype html><html><body>shell</body></html>';

class FakeRes extends Writable {
  status = 0;
  headers: Record<string, string> = {};
  headersSent = false;
  req: { headers: Record<string, string> };
  private readonly chunks: Buffer[] = [];

  constructor(acceptEncoding?: string) {
    super();
    this.req = { headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : {} };
  }

  writeHead(status: number, headers: Record<string, string>): this {
    this.status = status;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk as Buffer));
    callback();
  }

  body(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

async function serve(distDir: string, pathname: string, acceptEncoding?: string) {
  const res = new FakeRes(acceptEncoding);
  const handled = serveWorkspaceUi(res as unknown as http.ServerResponse, pathname, distDir);
  const started = Date.now();
  while (!res.writableEnded && Date.now() - started < 3000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { handled, res };
}

describe('static UI asset serving', () => {
  let distDir: string;

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-ui-dist-'));
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
    fs.writeFileSync(path.join(distDir, 'assets', 'app-ABCD1234.js'), BIG_JS);
    fs.writeFileSync(path.join(distDir, 'assets', 'tiny-EFGH5678.js'), 'let x=1;');
  });

  afterAll(() => {
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('serves a content-hashed asset as brotli when the client prefers it', async () => {
    const { handled, res } = await serve(distDir, '/assets/app-ABCD1234.js', 'gzip, deflate, br');
    expect(handled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers.Vary).toBe('Accept-Encoding');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(zlib.brotliDecompressSync(res.body()).toString('utf8')).toBe(BIG_JS);
    expect(Number(res.headers['content-length'])).toBe(res.body().byteLength);
  });

  it('falls back to gzip when brotli is not accepted', async () => {
    const { res } = await serve(distDir, '/assets/app-ABCD1234.js', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(zlib.gunzipSync(res.body()).toString('utf8')).toBe(BIG_JS);
  });

  it('serves identity when the client accepts no supported encoding', async () => {
    const { res } = await serve(distDir, '/assets/app-ABCD1234.js', undefined);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body().toString('utf8')).toBe(BIG_JS);
  });

  it('does not cache index.html immutably', async () => {
    const { res } = await serve(distDir, '/', 'br');
    expect(res.headers['cache-control']).toBe('no-cache');
    // index.html here is below the compression threshold, so it stays identity.
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body().toString('utf8')).toBe(INDEX_HTML);
  });

  it('leaves sub-threshold assets uncompressed', async () => {
    const { res } = await serve(distDir, '/assets/tiny-EFGH5678.js', 'br');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body().toString('utf8')).toBe('let x=1;');
  });

  it('serves the compressed asset identically on a cache hit', async () => {
    const { res: first } = await serve(distDir, '/assets/app-ABCD1234.js', 'br');
    const { res: second } = await serve(distDir, '/assets/app-ABCD1234.js', 'br');
    expect(second.headers['content-encoding']).toBe('br');
    expect(second.body().equals(first.body())).toBe(true);
    expect(zlib.brotliDecompressSync(second.body()).toString('utf8')).toBe(BIG_JS);
  });

  it('refuses path traversal and falls back to index.html', async () => {
    const { res } = await serve(distDir, '/../../../../etc/passwd', undefined);
    expect(res.status).toBe(200);
    expect(res.body().toString('utf8')).toBe(INDEX_HTML);
  });
});
