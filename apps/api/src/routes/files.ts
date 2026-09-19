/**
 * File Content Routes
 *
 * Authoritative file content read/write endpoints that delegate to
 * @vestara/filesystem-runtime (the single filesystem authority).
 *
 * Reads (view permission): GET /api/files/content, GET /api/files/stat,
 *   GET /api/files/stream (HTTP Range), GET /api/files/download.
 * Mutations (edit permission, editor role+): POST /api/files/write,
 *   POST /api/files/create, POST /api/files/delete, POST /api/files/rename,
 *   POST /api/files/copy, POST /api/files/move (rename alias).
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 *   FILES-EDITOR-001 F-E-1: Governed user-facing file-mutation + media-stream authority
 */

import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5 MB limit for preview
const MAX_EDIT_SIZE = 2 * 1024 * 1024; // 2 MB limit for editing

interface WriteRequest {
  path: string;
  content: string;
  approvalId?: string;
  dryRun?: boolean;
}

function validatePath(repoPath: string, requestedPath: string): string {
  const resolved = path.resolve(repoPath, requestedPath);
  const relative = path.relative(repoPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes workspace root');
  }
  return resolved;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.avif': 'image/avif',
    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    // Text/Code
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.mdx': 'text/markdown',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.css': 'text/css',
    '.scss': 'text/scss',
    '.sass': 'text/sass',
    '.less': 'text/less',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.xml': 'application/xml',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.go': 'text/x-go',
    '.java': 'text/x-java',
    '.cpp': 'text/x-cpp',
    '.c': 'text/x-c',
    '.h': 'text/x-c',
    '.hpp': 'text/x-cpp',
    '.sh': 'text/x-shellscript',
    '.bash': 'text/x-shellscript',
    '.zsh': 'text/x-shellscript',
    '.fish': 'text/x-shellscript',
    '.toml': 'text/toml',
    '.ini': 'text/plain',
    '.cfg': 'text/plain',
    '.conf': 'text/plain',
    '.dockerfile': 'text/x-dockerfile',
    '.gitignore': 'text/plain',
    '.gitattributes': 'text/plain',
    '.env': 'text/plain',
    '.lock': 'text/plain',
    '.sql': 'text/x-sql',
    '.graphql': 'text/x-graphql',
    '.gql': 'text/x-graphql',
    '.proto': 'text/x-protobuf',
    '.vue': 'text/x-vue',
    '.svelte': 'text/x-svelte',
    '.astro': 'text/x-astro',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/x-yaml' ||
    mime === 'text/x-sql' ||
    mime === 'text/x-graphql'
  );
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/');
}

export async function handleFilesRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
): Promise<boolean> {
  if (!p.startsWith('/api/files')) return false;

  const repoPath = ctx.repoPath;

  // GET /api/files/content?path=<workspace-relative-path>
  if (method === 'GET' && p === '/api/files/content') {
    const requestedPath = url.searchParams.get('path');
    if (!requestedPath) {
      json(res, 400, { error: 'path query parameter is required' });
      return true;
    }

    try {
      validatePath(repoPath, requestedPath);

      // Check file exists and get stats
      const statResult = await ctx.filesystemRuntime.stat(requestedPath);
      if (!statResult.ok || !statResult.data) {
        json(res, 404, { error: 'File not found', detail: statResult.error });
        return true;
      }

      const { size, isFile } = statResult.data;
      if (!isFile) {
        json(res, 400, { error: 'Path is not a file' });
        return true;
      }

      // For large files, return metadata only (preview not available)
      if (size > MAX_PREVIEW_SIZE) {
        json(res, 200, {
          path: requestedPath,
          size,
          mimeType: getMimeType(requestedPath),
          previewAvailable: false,
          reason: `File size (${size} bytes) exceeds preview limit (${MAX_PREVIEW_SIZE} bytes)`,
        });
        return true;
      }

      // Read file content
      const readResult = await ctx.filesystemRuntime.read(requestedPath);
      if (!readResult.ok || !readResult.data) {
        json(res, 500, { error: 'Failed to read file', detail: readResult.error });
        return true;
      }

      const mimeType = getMimeType(requestedPath);
      const content = readResult.data;

      const responseBase = {
        path: requestedPath,
        size,
        mimeType,
        content,
        previewAvailable: true,
        encoding: isTextMime(mimeType) ? 'utf-8' : 'base64',
      } as const;

      if (isTextMime(mimeType)) {
        json(res, 200, responseBase);
      } else {
        json(res, 200, {
          ...responseBase,
          contentBase64: Buffer.from(content, 'utf-8').toString('base64'),
        });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // POST /api/files/write
  if (method === 'POST' && p === '/api/files/write') {
    let body: WriteRequest;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : ({} as WriteRequest);
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }

    const { path: filePath, content, approvalId, dryRun } = body;
    if (!filePath || content === undefined) {
      json(res, 400, { error: 'path and content are required' });
      return true;
    }

    // Size limit for editing
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_EDIT_SIZE) {
      json(res, 413, {
        error: `Content size (${contentSize} bytes) exceeds edit limit (${MAX_EDIT_SIZE} bytes)`,
      });
      return true;
    }

    try {
      validatePath(repoPath, filePath);

      const writeResult = await ctx.filesystemRuntime.write(filePath, content, {
        agentId: 'workspace-ui',
        reason: 'User edit via Files preview',
        approvalId,
        dryRun,
      });

      if (!writeResult.ok) {
        const statusCode = writeResult.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: writeResult.error,
          requiresApproval: writeResult.requiresApproval,
          approvalId: writeResult.approvalId,
          operation: writeResult.operation,
        });
        return true;
      }

      json(res, 200, {
        ok: true,
        path: filePath,
        size: writeResult.data?.size ?? contentSize,
        dryRun: writeResult.dryRun ?? false,
        operation: writeResult.operation,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // GET /api/files/stat?path=<workspace-relative-path>
  if (method === 'GET' && p === '/api/files/stat') {
    const requestedPath = url.searchParams.get('path');
    if (!requestedPath) {
      json(res, 400, { error: 'path query parameter is required' });
      return true;
    }

    try {
      validatePath(repoPath, requestedPath);
      const statResult = await ctx.filesystemRuntime.stat(requestedPath);
      if (!statResult.ok || !statResult.data) {
        json(res, 404, { error: 'File not found', detail: statResult.error });
        return true;
      }

      json(res, 200, {
        ...statResult.data,
        path: requestedPath,
        mimeType: getMimeType(requestedPath),
        previewAvailable: statResult.data.isFile && statResult.data.size <= MAX_PREVIEW_SIZE,
        editAvailable: statResult.data.isFile && statResult.data.size <= MAX_EDIT_SIZE,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // ─── F-E-1 mutations (edit permission: editor role+) ────────────
  // Every mutation delegates to ctx.filesystemRuntime — the single
  // filesystem authority (sandbox resolve, deny-list, policy engine,
  // approvals, audit). View Permission ≠ Edit Permission ≠ Save Authority.

  // POST /api/files/create {path, isDirectory?, content?, approvalId?, dryRun?}
  if (method === 'POST' && p === '/api/files/create') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    let body: { path?: string; isDirectory?: boolean; content?: string; approvalId?: string; dryRun?: boolean };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }
    const { path: filePath, isDirectory, content, approvalId, dryRun } = body;
    if (!filePath) {
      json(res, 400, { error: 'path is required' });
      return true;
    }
    try {
      validatePath(repoPath, filePath);
      const target = isDirectory && !filePath.endsWith('/') ? `${filePath}/` : filePath;
      const result = await ctx.filesystemRuntime.create(target, content, {
        agentId: 'workspace-ui',
        reason: 'User create via Files browser',
        approvalId,
        dryRun,
      });
      if (!result.ok) {
        const statusCode = result.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: result.error,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          operation: result.operation,
        });
        return true;
      }
      json(res, 200, { ok: true, path: filePath, dryRun: result.dryRun ?? false, operation: result.operation });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // POST /api/files/delete {path, approvalId?, dryRun?}
  if (method === 'POST' && p === '/api/files/delete') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    let body: { path?: string; approvalId?: string; dryRun?: boolean };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }
    const { path: filePath, approvalId, dryRun } = body;
    if (!filePath) {
      json(res, 400, { error: 'path is required' });
      return true;
    }
    try {
      validatePath(repoPath, filePath);
      const result = await ctx.filesystemRuntime.delete(filePath, {
        agentId: 'workspace-ui',
        reason: 'User delete via Files browser',
        approvalId,
        dryRun,
      });
      if (!result.ok) {
        const statusCode = result.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: result.error,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          operation: result.operation,
        });
        return true;
      }
      json(res, 200, { ok: true, path: filePath, dryRun: result.dryRun ?? false, operation: result.operation });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // POST /api/files/rename {oldPath, newPath, approvalId?, dryRun?}
  if (method === 'POST' && p === '/api/files/rename') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    let body: { oldPath?: string; newPath?: string; approvalId?: string; dryRun?: boolean };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }
    const { oldPath, newPath, approvalId, dryRun } = body;
    if (!oldPath || !newPath) {
      json(res, 400, { error: 'oldPath and newPath are required' });
      return true;
    }
    const moveError = rejectSelfMove(oldPath, newPath);
    if (moveError) {
      json(res, 400, { error: moveError });
      return true;
    }
    try {
      validatePath(repoPath, oldPath);
      validatePath(repoPath, newPath);
      const result = await ctx.filesystemRuntime.rename(oldPath, newPath, {
        agentId: 'workspace-ui',
        reason: 'User rename via Files browser',
        approvalId,
        dryRun,
      });
      if (!result.ok) {
        const statusCode = result.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: result.error,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          operation: result.operation,
        });
        return true;
      }
      json(res, 200, {
        ok: true,
        oldPath,
        newPath,
        dryRun: result.dryRun ?? false,
        operation: result.operation,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // POST /api/files/copy {sourcePath, destinationPath, approvalId?, dryRun?}
  if (method === 'POST' && p === '/api/files/copy') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    let body: { sourcePath?: string; destinationPath?: string; approvalId?: string; dryRun?: boolean };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }
    const { sourcePath, destinationPath, approvalId, dryRun } = body;
    if (!sourcePath || !destinationPath) {
      json(res, 400, { error: 'sourcePath and destinationPath are required' });
      return true;
    }
    const moveError = rejectSelfMove(sourcePath, destinationPath);
    if (moveError) {
      json(res, 400, { error: moveError });
      return true;
    }
    try {
      validatePath(repoPath, sourcePath);
      validatePath(repoPath, destinationPath);
      const result = await ctx.filesystemRuntime.copy(sourcePath, destinationPath, {
        agentId: 'workspace-ui',
        reason: 'User copy via Files browser',
        approvalId,
        dryRun,
      });
      if (!result.ok) {
        const statusCode = result.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: result.error,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          operation: result.operation,
        });
        return true;
      }
      json(res, 200, {
        ok: true,
        sourcePath,
        destinationPath,
        size: result.data?.size ?? 0,
        dryRun: result.dryRun ?? false,
        operation: result.operation,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // POST /api/files/move {sourcePath, destinationPath, approvalId?, dryRun?}
  // Explicit move alias over rename (same authority, same guards).
  if (method === 'POST' && p === '/api/files/move') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    let body: { sourcePath?: string; destinationPath?: string; approvalId?: string; dryRun?: boolean };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return true;
    }
    const { sourcePath, destinationPath, approvalId, dryRun } = body;
    if (!sourcePath || !destinationPath) {
      json(res, 400, { error: 'sourcePath and destinationPath are required' });
      return true;
    }
    const moveError = rejectSelfMove(sourcePath, destinationPath);
    if (moveError) {
      json(res, 400, { error: moveError });
      return true;
    }
    try {
      validatePath(repoPath, sourcePath);
      validatePath(repoPath, destinationPath);
      const result = await ctx.filesystemRuntime.rename(sourcePath, destinationPath, {
        agentId: 'workspace-ui',
        reason: 'User move via Files browser',
        approvalId,
        dryRun,
      });
      if (!result.ok) {
        const statusCode = result.requiresApproval ? 402 : 400;
        json(res, statusCode, {
          error: result.error,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          operation: result.operation,
        });
        return true;
      }
      json(res, 200, {
        ok: true,
        sourcePath,
        destinationPath,
        dryRun: result.dryRun ?? false,
        operation: result.operation,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // GET /api/files/stream?path=… — HTTP Range media streaming (view permission).
  // Byte-serving counterpart to the base64 /api/files/content preview:
  // required before >5 MB video/audio is real. No transcoding, no derivatives.
  if (method === 'GET' && p === '/api/files/stream') {
    const requestedPath = url.searchParams.get('path');
    if (!requestedPath) {
      json(res, 400, { error: 'path query parameter is required' });
      return true;
    }
    try {
      const absPath = validatePath(repoPath, requestedPath);
      const statResult = await ctx.filesystemRuntime.stat(requestedPath);
      if (!statResult.ok || !statResult.data) {
        json(res, 404, { error: 'File not found', detail: statResult.error });
        return true;
      }
      if (!statResult.data.isFile) {
        json(res, 400, { error: 'Path is not a file' });
        return true;
      }
      const size = statResult.data.size;
      const mimeType = getMimeType(requestedPath);
      const range = req.headers.range;
      if (!range) {
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(absPath).pipe(res);
        return true;
      }
      const parsed = parseRange(range, size);
      if (!parsed) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return true;
      }
      const { start, end } = parsed;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mimeType,
      });
      fs.createReadStream(absPath, { start, end }).pipe(res);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // GET /api/files/browse?path=<dir>&recursive=0|1&depth=N — read-only
  // directory projection (view permission). Composes the existing
  // list + stat runtime contracts; the tree is a projection, never an
  // authority. Bounded: per-dir entry cap, total cap, max depth, and
  // generated-artifact excludes so real workspaces project fully.
  if (method === 'GET' && p === '/api/files/browse') {
    const requestedPath = url.searchParams.get('path') ?? '.';
    const recursive = url.searchParams.get('recursive') !== '0';
    const depthParam = Number(url.searchParams.get('depth') ?? BROWSE_DEFAULT_DEPTH);
    const depth = Number.isFinite(depthParam)
      ? Math.min(Math.max(Math.floor(depthParam), 0), BROWSE_MAX_DEPTH)
      : BROWSE_DEFAULT_DEPTH;
    try {
      validatePath(repoPath, requestedPath);
      const tree = await browseDirectory(ctx, requestedPath, recursive ? depth : 0);
      if (!tree) {
        json(res, 404, { error: 'Directory not found' });
        return true;
      }
      json(res, 200, {
        path: requestedPath === '' ? '.' : requestedPath,
        entries: tree.entries,
        truncated: tree.truncated,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // ─── FP-10 approval decisions (edit permission: editor role+) ────
  // The runtime owns approval state; these endpoints only surface decide().
  // GET /api/files/approvals → pending list; POST .../:id/approve|reject.

  if (method === 'GET' && p === '/api/files/approvals') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const pending = ctx.filesystemRuntime.getPendingApprovals();
    json(
      res,
      200,
      pending.map((op) => ({
        approvalId: op.id,
        type: op.type,
        path: op.path,
        ...(op.targetPath !== undefined ? { targetPath: op.targetPath } : {}),
        riskLevel: op.riskLevel,
        reason: op.reason ?? null,
        createdAt: op.createdAt,
        envelope: ctx.filesystemRuntime.getEnvelope(op.id) ?? null,
      })),
    );
    return true;
  }

  const approvalMatch = p.match(/^\/api\/files\/approvals\/([^/]+)\/(approve|reject)$/);
  if (method === 'POST' && approvalMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const [, approvalId, decision] = approvalMatch;
    const settled =
      decision === 'approve' ? ctx.filesystemRuntime.approve(approvalId) : ctx.filesystemRuntime.reject(approvalId);
    if (!settled) {
      json(res, 404, { error: 'Approval not found or already decided' });
      return true;
    }
    json(res, 200, { ok: true, approvalId, decision });
    return true;
  }

  // GET /api/files/search?q=<pattern>&dir=<dir> — governed content/glob
  // search (view permission). Delegates to the runtime search contract
  // (bounded result sets); backs the Files Search tab (FP-5).
  if (method === 'GET' && p === '/api/files/search') {
    const pattern = url.searchParams.get('q') ?? '';
    const dir = url.searchParams.get('dir') ?? '.';
    if (!pattern.trim()) {
      json(res, 400, { error: 'q query parameter is required' });
      return true;
    }
    if (pattern.length > 200) {
      json(res, 400, { error: 'q exceeds 200 characters' });
      return true;
    }
    try {
      validatePath(repoPath, dir);
      const result = await ctx.filesystemRuntime.search(pattern, dir);
      if (!result.ok) {
        json(res, 400, { error: result.error ?? 'Search failed' });
        return true;
      }
      json(res, 200, { pattern, dir, results: result.data ?? [] });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  // GET /api/files/download?path=… — attachment download (view permission).
  if (method === 'GET' && p === '/api/files/download') {
    const requestedPath = url.searchParams.get('path');
    if (!requestedPath) {
      json(res, 400, { error: 'path query parameter is required' });
      return true;
    }
    try {
      const absPath = validatePath(repoPath, requestedPath);
      const statResult = await ctx.filesystemRuntime.stat(requestedPath);
      if (!statResult.ok || !statResult.data) {
        json(res, 404, { error: 'File not found', detail: statResult.error });
        return true;
      }
      if (!statResult.data.isFile) {
        json(res, 400, { error: 'Path is not a file' });
        return true;
      }
      const fileName = path.basename(requestedPath);
      res.writeHead(200, {
        'Content-Type': getMimeType(requestedPath),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(statResult.data.size),
      });
      const stream = fs.createReadStream(absPath);
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid path';
      json(res, 400, { error: message });
      return true;
    }
  }

  return false;
}

/** Bounded projection policy: generated-artifact dirs never projected (matches runtime walkSync). */
const BROWSE_EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist']);
const BROWSE_DEFAULT_DEPTH = 10;
const BROWSE_MAX_DEPTH = 16;
const BROWSE_MAX_ENTRIES_PER_DIR = 1000;
const BROWSE_MAX_TOTAL = 5000;

interface BrowseNode {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  size?: number;
  mtime?: string;
  createdAt?: string;
  mimeType?: string;
  children?: BrowseNode[];
}

/**
 * Project a directory breadth-first via the list + stat runtime contracts.
 * Returns null when the directory itself is unreadable. Unreadable children
 * are skipped. Breadth-first traversal preserves sibling visibility under the
 * global projection budget; per-directory and total caps set truncated.
 */
async function browseDirectory(
  ctx: WorkspaceContext,
  dirRel: string,
  depth: number,
): Promise<{ entries: BrowseNode[]; truncated: boolean } | null> {
  const budget = { remaining: BROWSE_MAX_TOTAL };
  const listed = await ctx.filesystemRuntime.list(dirRel === '' ? '.' : dirRel);
  if (!listed.ok || !listed.data) return null;
  const parentRel = dirRel === '.' || dirRel === '' ? '' : dirRel;
  let truncated = false;
  const entries: BrowseNode[] = [];
  const names = listed.data.slice(0, BROWSE_MAX_ENTRIES_PER_DIR);
  if (listed.data.length > names.length) truncated = true;
  for (const name of names) {
    if (budget.remaining <= 0) {
      truncated = true;
      break;
    }
    const rel = parentRel === '' ? name : `${parentRel}/${name}`;
    if (BROWSE_EXCLUDE_DIRS.has(name)) continue;
    const meta = await ctx.filesystemRuntime.stat(rel);
    if (!meta.ok || !meta.data) continue;
    budget.remaining -= 1;
    if (meta.data.isDirectory) {
      entries.push({ name, path: rel, kind: 'dir', children: [] });
    } else if (meta.data.isFile) {
      entries.push({
        name,
        path: rel,
        kind: 'file',
        size: meta.data.size,
        mtime: meta.data.modifiedAt,
        createdAt: meta.data.createdAt,
        mimeType: getMimeType(rel),
      });
    }
  }
  // Breadth-first descendant projection is populated from a shared queue.
  const queue: Array<{ path: string; remainingDepth: number; children: BrowseNode[] }> = [];
  if (depth > 0) {
    for (const node of entries) {
      if (node.kind === 'dir' && node.children) {
        queue.push({ path: node.path, remainingDepth: depth, children: node.children });
      }
    }
  }
  let queueIndex = 0;
  while (queueIndex < queue.length && budget.remaining > 0) {
    const current = queue[queueIndex++];
    const childList = await ctx.filesystemRuntime.list(current.path);
    if (childList.ok === false || childList.data === undefined) continue;
    const childNames = childList.data.slice(0, BROWSE_MAX_ENTRIES_PER_DIR);
    if (childList.data.length > childNames.length) truncated = true;
    for (const name of childNames) {
      if (budget.remaining <= 0) {
        truncated = true;
        break;
      }
      if (BROWSE_EXCLUDE_DIRS.has(name)) continue;
      const rel = `${current.path}/${name}`;
      const meta = await ctx.filesystemRuntime.stat(rel);
      if (meta.ok === false || meta.data === undefined) continue;
      budget.remaining -= 1;
      if (meta.data.isDirectory) {
        const children: BrowseNode[] = [];
        const child: BrowseNode = { name, path: rel, kind: 'dir', children };
        current.children.push(child);
        if (current.remainingDepth > 1) {
          queue.push({ path: rel, remainingDepth: current.remainingDepth - 1, children });
        }
      } else if (meta.data.isFile) {
        current.children.push({
          name,
          path: rel,
          kind: 'file',
          size: meta.data.size,
          mtime: meta.data.modifiedAt,
          createdAt: meta.data.createdAt,
          mimeType: getMimeType(rel),
        });
      }
    }
    current.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  if (queueIndex < queue.length && budget.remaining <= 0) truncated = true;

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { entries, truncated };
}

/**
 * Reject moves/renames/copies of a path into itself or its own subtree
 * (ai-planner FileExplorer handleDrop guard, server-enforced here so no
 * client can bypass it). Returns an error message or null when allowed.
 */
function rejectSelfMove(source: string, destination: string): string | null {
  const norm = (v: string) => v.replace(/\\/g, '/').replace(/\/+$/, '');
  const src = norm(source);
  const dest = norm(destination);
  if (!src || !dest) return null;
  if (dest === src) return 'Destination is the same as the source';
  if (dest.startsWith(`${src}/`)) return 'Cannot move a directory into its own subdirectory';
  return null;
}

/** Parse a single `bytes=start-end` range. Returns null when unsatisfiable. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startStr, endStr] = match;
  let start: number;
  let end: number;
  if (startStr === '' && endStr === '') return null;
  if (startStr === '') {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Number(endStr);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export { getMimeType, isAudioMime, isImageMime, isTextMime, isVideoMime };
