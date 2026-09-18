/**
 * FILES-EDITOR-001 F-E-1: governed file-mutation + media-stream endpoints.
 *
 * Verifies every mutation traverses the authoritative FilesystemRuntime
 * (real instance against a temp workspace root — no mocks on the authority
 * path) and that view/edit permission separation holds:
 * reads + stream/download are open, mutations require editor role+.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleFilesRoute } from '../src/routes/files.js';

function makeRequest(
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string } = {},
): http.IncomingMessage {
  const req = new EventEmitter() as any;
  req.method = options.method ?? 'GET';
  req.url = options.url ?? '/api/files/stat?path=x';
  req.headers = { ...(options.headers ?? {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.readableEnded = false;
  queueMicrotask(() => {
    if (options.body !== undefined) req.emit('data', Buffer.from(options.body));
    req.readableEnded = true;
    req.emit('end');
  });
  return req;
}

function makeResponse() {
  let statusCode = 0;
  let bodyText = '';
  const headerStore: Record<string, string> = {};
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.headersSent = false;
  res.writableEnded = false;
  res.writable = true;
  res.writeHead = (code: number, headers?: Record<string, string>) => {
    res.statusCode = code;
    statusCode = code;
    res.headersSent = true;
    if (headers) Object.assign(headerStore, headers);
    return res;
  };
  res.end = (data?: string | Buffer) => {
    if (data !== undefined) bodyText += String(data);
    res.writableEnded = true;
    res.emit('finish');
  };
  res.write = (chunk: string | Buffer) => {
    if (chunk !== undefined) bodyText += String(chunk);
    return true;
  };
  res.setHeader = (name: string, value: string) => {
    headerStore[name] = value;
  };
  res.getHeader = (name: string) => headerStore[name];
  return {
    res,
    status: () => statusCode,
    body: () => {
      if (!bodyText) return undefined;
      try {
        return JSON.parse(bodyText);
      } catch {
        return bodyText;
      }
    },
    headers: () => Object.fromEntries(Object.entries(headerStore).map(([k, v]) => [k.toLowerCase(), v])),
  };
}

describe('files editor routes (F-E-1)', () => {
  let root: string;
  let ctx: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-editor-test-'));
    fs.writeFileSync(path.join(root, 'hello.txt'), 'hello world');
    fs.writeFileSync(path.join(root, 'clip.mp4'), Buffer.alloc(1024, 7));
    ctx = {
      repoPath: root,
      filesystemRuntime: new FilesystemRuntime({ rootDir: root }),
      users: { findByToken: () => undefined },
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function call(method: string, p: string, url: string, body?: unknown, headers?: Record<string, string>) {
    const { res, status, body: getBody, headers: getHeaders } = makeResponse();
    const req = makeRequest({
      method,
      url,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const handled = await handleFilesRoute(method, p, req, res, ctx, 3001, new URL(url, 'http://127.0.0.1'));
    return { handled, status: status(), data: getBody(), headers: getHeaders() };
  }

  it('creates a file through the authoritative runtime', async () => {
    const r = await call('POST', '/api/files/create', '/api/files/create', { path: 'new/note.txt', content: 'hi' });
    expect(r.handled).toBe(true);
    expect(r.status).toBe(200);
    expect((r.data as any).ok).toBe(true);
    expect(fs.readFileSync(path.join(root, 'new', 'note.txt'), 'utf-8')).toBe('hi');
  });

  it('creates a directory when isDirectory is set', async () => {
    const r = await call('POST', '/api/files/create', '/api/files/create', { path: 'assets', isDirectory: true });
    expect(r.status).toBe(200);
    expect(fs.statSync(path.join(root, 'assets')).isDirectory()).toBe(true);
  });

  it('deletes a file through the authoritative runtime (high-risk → approval → approved re-call)', async () => {
    const first = await call('POST', '/api/files/delete', '/api/files/delete', { path: 'hello.txt' });
    expect(first.status).toBe(402);
    expect((first.data as any).requiresApproval).toBe(true);
    const approvalId = (first.data as any).approvalId as string;
    expect(approvalId).toBeTruthy();
    // File must still exist until approval is granted (Save Authority).
    expect(fs.existsSync(path.join(root, 'hello.txt'))).toBe(true);

    expect(ctx.filesystemRuntime.approve(approvalId)).toBe(true);
    const second = await call('POST', '/api/files/delete', '/api/files/delete', { path: 'hello.txt', approvalId });
    expect(second.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'hello.txt'))).toBe(false);
  });

  it('renames a file and rejects moves into their own subtree', async () => {
    const ok = await call('POST', '/api/files/rename', '/api/files/rename', {
      oldPath: 'hello.txt',
      newPath: 'renamed.txt',
    });
    expect(ok.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'renamed.txt'))).toBe(true);

    fs.mkdirSync(path.join(root, 'dir'));
    const bad = await call('POST', '/api/files/move', '/api/files/move', {
      sourcePath: 'dir',
      destinationPath: 'dir/sub',
    });
    expect(bad.status).toBe(400);
    expect(String((bad.data as any).error)).toMatch(/own subdirectory/);
  });

  it('copies a file through the authoritative runtime', async () => {
    const r = await call('POST', '/api/files/copy', '/api/files/copy', {
      sourcePath: 'hello.txt',
      destinationPath: 'copy.txt',
    });
    expect(r.status).toBe(200);
    expect(fs.readFileSync(path.join(root, 'copy.txt'), 'utf-8')).toBe('hello world');
  });

  it('moves via the move alias (rename authority)', async () => {
    const r = await call('POST', '/api/files/move', '/api/files/move', {
      sourcePath: 'hello.txt',
      destinationPath: 'sub/moved.txt',
    });
    expect(r.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'hello.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'sub', 'moved.txt'), 'utf-8')).toBe('hello world');
  });

  it('rejects mutations from viewers (View ≠ Edit)', async () => {
    const viewerCtx = {
      ...ctx,
      users: { findByToken: () => ({ id: 'v', username: 'viewer', role: 'viewer' }) },
    };
    const { res, status } = makeResponse();
    const req = makeRequest({
      method: 'POST',
      url: '/api/files/delete',
      headers: { authorization: 'Bearer viewer-token' },
      body: JSON.stringify({ path: 'hello.txt' }),
    });
    const handled = await handleFilesRoute(
      'POST',
      '/api/files/delete',
      req,
      res,
      viewerCtx,
      3001,
      new URL(req.url!, 'http://127.0.0.1'),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(403);
    expect(fs.existsSync(path.join(root, 'hello.txt'))).toBe(true);
  });

  it('rejects paths escaping the workspace root', async () => {
    const r = await call('POST', '/api/files/delete', '/api/files/delete', { path: '../escape.txt' });
    expect(r.status).toBe(400);
  });

  it('streams full content with accept-ranges for viewers', async () => {
    const { res, status, headers } = makeResponse();
    const req = makeRequest({ method: 'GET', url: '/api/files/stream?path=clip.mp4' });
    // Capture streamed bytes instead of JSON
    let bytes = Buffer.alloc(0);
    const origEnd = res.end;
    res.end = (data?: string | Buffer) => {
      if (data !== undefined) bytes = Buffer.concat([bytes, Buffer.isBuffer(data) ? data : Buffer.from(String(data))]);
      return origEnd.call(res, undefined);
    };
    const origWrite = (res as any).write;
    (res as any).write = (chunk: any) => {
      bytes = Buffer.concat([bytes, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))]);
      return true;
    };
    void origWrite;
    const handled = await handleFilesRoute(
      'GET',
      '/api/files/stream',
      req,
      res,
      ctx,
      3001,
      new URL(req.url!, 'http://127.0.0.1'),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect(headers()['accept-ranges']).toBe('bytes');
    expect(headers()['content-type']).toBe('video/mp4');
    expect(bytes.length).toBe(1024);
  });

  it('serves byte ranges with 206 and rejects bad ranges with 416', async () => {
    const range = await (async () => {
      const { res, status, headers } = makeResponse();
      const req = makeRequest({
        method: 'GET',
        url: '/api/files/stream?path=clip.mp4',
        headers: { range: 'bytes=0-99' },
      });
      const handled = await handleFilesRoute(
        'GET',
        '/api/files/stream',
        req,
        res,
        ctx,
        3001,
        new URL(req.url!, 'http://127.0.0.1'),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { handled, status: status(), headers: headers() };
    })();
    expect(range.handled).toBe(true);
    expect(range.status).toBe(206);
    expect(range.headers['content-range']).toBe('bytes 0-99/1024');

    const bad = await call('GET', '/api/files/stream', '/api/files/stream?path=clip.mp4', undefined, {
      range: 'bytes=9999-10000',
    });
    expect(bad.status).toBe(416);
  });

  it('returns 404 for missing stream targets', async () => {
    const r = await call('GET', '/api/files/stream', '/api/files/stream?path=nope.txt');
    expect(r.status).toBe(404);
  });
});

describe('files approvals + search (FILES-PAGE-001 FP-10/FP-5)', () => {
  let root: string;
  let ctx: any;

  async function post(p: string, body?: unknown, headers?: Record<string, string>) {
    const { res, status, body: getBody } = makeResponse();
    const req = makeRequest({
      method: 'POST',
      url: p,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const handled = await handleFilesRoute(
      'POST',
      p.split('?')[0],
      req,
      res,
      ctx,
      3001,
      new URL(p, 'http://127.0.0.1'),
    );
    return { handled, status: status(), data: getBody() as any };
  }

  async function get(url: string) {
    const { res, status, body: getBody } = makeResponse();
    const req = makeRequest({ method: 'GET', url });
    const p = new URL(url, 'http://127.0.0.1').pathname;
    const handled = await handleFilesRoute('GET', p, req, res, ctx, 3001, new URL(url, 'http://127.0.0.1'));
    return { handled, status: status(), data: getBody() as any };
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-approval-test-'));
    fs.writeFileSync(path.join(root, 'doomed.txt'), 'bye');
    fs.writeFileSync(path.join(root, 'hello.txt'), 'hello world');
    fs.writeFileSync(path.join(root, 'searchable.md'), 'hello world');
    ctx = {
      repoPath: root,
      filesystemRuntime: new FilesystemRuntime({ rootDir: root }),
      users: { findByToken: () => undefined },
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists empty approvals, then surfaces a pending delete', async () => {
    expect((await get('/api/files/approvals')).data).toEqual([]);
    const del = await post('/api/files/delete', { path: 'doomed.txt' });
    expect(del.status).toBe(402);
    const list = await get('/api/files/approvals');
    expect(list.status).toBe(200);
    expect(list.data).toEqual([
      expect.objectContaining({ approvalId: (del.data as any).approvalId, type: 'delete', path: 'doomed.txt' }),
    ]);
  });

  it('approves via endpoint so the retry executes', async () => {
    const del = await post('/api/files/delete', { path: 'doomed.txt' });
    const approvalId = (del.data as any).approvalId as string;
    const approved = await post(`/api/files/approvals/${approvalId}/approve`);
    expect(approved.status).toBe(200);
    expect((approved.data as any).decision).toBe('approve');
    const retry = await post('/api/files/delete', { path: 'doomed.txt', approvalId });
    expect(retry.status).toBe(200);
    expect(fs.existsSync(path.join(root, 'doomed.txt'))).toBe(false);
    expect((await get('/api/files/approvals')).data).toEqual([]);
  });

  it('rejects via endpoint and reports unknown ids truthfully', async () => {
    const del = await post('/api/files/delete', { path: 'doomed.txt' });
    const approvalId = (del.data as any).approvalId as string;
    const rejected = await post(`/api/files/approvals/${approvalId}/reject`);
    expect(rejected.status).toBe(200);
    const retry = await post('/api/files/delete', { path: 'doomed.txt', approvalId });
    expect(retry.status).toBe(400);
    expect(fs.existsSync(path.join(root, 'doomed.txt'))).toBe(true);
    expect((await post('/api/files/approvals/nope/approve')).status).toBe(404);
  });

  it('searches content via the runtime contract and validates input', async () => {
    const r = await get('/api/files/search?q=hello');
    expect(r.status).toBe(200);
    expect((r.data as any).results).toContain('searchable.md');
    expect((await get('/api/files/search')).status).toBe(400);
    expect((await get('/api/files/search?q=x&dir=..')).status).toBe(400);
  });
});

describe('files browse projection (FILES-EDITOR-002)', () => {
  let root: string;
  let ctx: any;

  async function callBrowse(url: string) {
    const { res, status, body: getBody } = makeResponse();
    const req = makeRequest({ method: 'GET', url });
    const p = new URL(url, 'http://127.0.0.1').pathname;
    const handled = await handleFilesRoute('GET', p, req, res, ctx, 3001, new URL(url, 'http://127.0.0.1'));
    return { handled, status: status(), data: getBody() as any };
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-browse-test-'));
    fs.mkdirSync(path.join(root, 'docs', 'governance'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'governance', 'guide.md'), '# guide');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'hello notes');
    fs.writeFileSync(path.join(root, 'config.json'), '{"name": "t"}');
    ctx = {
      repoPath: root,
      filesystemRuntime: new FilesystemRuntime({ rootDir: root }),
      users: { findByToken: () => undefined },
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns runtime-backed files and nested directories', async () => {
    const r = await callBrowse('/api/files/browse?recursive=1');
    expect(r.handled).toBe(true);
    expect(r.status).toBe(200);
    const byPath = new Map(
      r.data.entries.flatMap((e: any): any[] => [e, ...(e.children ?? [])]).map((e: any) => [e.path, e]),
    );
    expect(byPath.get('config.json')).toMatchObject({
      name: 'config.json',
      kind: 'file',
      mimeType: 'application/json',
    });
    expect(byPath.get('notes.txt')).toMatchObject({ name: 'notes.txt', kind: 'file' });
    expect(byPath.get('docs')).toMatchObject({ kind: 'dir' });
    const docs = r.data.entries.find((e: any) => e.path === 'docs');
    expect(docs.children.map((c: any) => c.path)).toContain('docs/governance');
    const gov = docs.children.find((c: any) => c.path === 'docs/governance');
    expect(gov.children).toEqual([
      expect.objectContaining({ path: 'docs/governance/guide.md', kind: 'file', mimeType: 'text/markdown' }),
    ]);
    expect(r.data.truncated).toBe(false);
  });

  it('lists a single level when recursive=0', async () => {
    const r = await callBrowse('/api/files/browse?path=docs&recursive=0');
    expect(r.status).toBe(200);
    expect(r.data.entries).toEqual([expect.objectContaining({ path: 'docs/governance', kind: 'dir', children: [] })]);
  });

  it('rejects root escape', async () => {
    const r = await callBrowse('/api/files/browse?path=..');
    expect(r.status).toBe(400);
  });

  it('returns 404 for missing directories', async () => {
    const r = await callBrowse('/api/files/browse?path=nope');
    expect(r.status).toBe(404);
  });

  it('create → browse exposes the created entry', async () => {
    const { res, status } = makeResponse();
    const req = makeRequest({
      method: 'POST',
      url: '/api/files/create',
      body: JSON.stringify({ path: 'new/note.txt', content: 'hi' }),
    });
    await handleFilesRoute('POST', '/api/files/create', req, res, ctx, 3001, new URL(req.url!, 'http://127.0.0.1'));
    expect(status()).toBe(200);

    const r = await callBrowse('/api/files/browse?recursive=1');
    const top = new Map(r.data.entries.map((e: any) => [e.path, e]));
    expect(top.get('new')).toMatchObject({ kind: 'dir' });
    expect((top.get('new') as any).children).toEqual([expect.objectContaining({ path: 'new/note.txt', kind: 'file' })]);
  });

  it('rename → browse exposes the new location and removes the old projection', async () => {
    const { res, status } = makeResponse();
    const req = makeRequest({
      method: 'POST',
      url: '/api/files/rename',
      body: JSON.stringify({ oldPath: 'notes.txt', newPath: 'renamed.txt' }),
    });
    await handleFilesRoute('POST', '/api/files/rename', req, res, ctx, 3001, new URL(req.url!, 'http://127.0.0.1'));
    expect(status()).toBe(200);

    const r = await callBrowse('/api/files/browse?recursive=1');
    const paths = r.data.entries.map((e: any) => e.path);
    expect(paths).toContain('renamed.txt');
    expect(paths).not.toContain('notes.txt');
  });

  it('delete (approved) → browse removes the entry', async () => {
    const first = makeResponse();
    const req1 = makeRequest({ method: 'POST', url: '/api/files/delete', body: JSON.stringify({ path: 'notes.txt' }) });
    await handleFilesRoute(
      'POST',
      '/api/files/delete',
      req1,
      first.res,
      ctx,
      3001,
      new URL(req1.url!, 'http://127.0.0.1'),
    );
    expect(first.status()).toBe(402);
    const approvalId = (first.body() as any).approvalId as string;
    expect(ctx.filesystemRuntime.approve(approvalId)).toBe(true);

    const second = makeResponse();
    const req2 = makeRequest({
      method: 'POST',
      url: '/api/files/delete',
      body: JSON.stringify({ path: 'notes.txt', approvalId }),
    });
    await handleFilesRoute(
      'POST',
      '/api/files/delete',
      req2,
      second.res,
      ctx,
      3001,
      new URL(req2.url!, 'http://127.0.0.1'),
    );
    expect(second.status()).toBe(200);

    const r = await callBrowse('/api/files/browse?recursive=1');
    expect(r.data.entries.map((e: any) => e.path)).not.toContain('notes.txt');
  });
});
