/**
 * @vestara/tools-filesystem — Filesystem Tools
 *
 * read_file, write_file operations with path traversal protection
 * and sandboxing.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → T-001, T-002
 */

import type { Tool } from '@vestara/action';
import type { ActionRequest, ToolDefinition } from '@vestara/shared';

const READ_FILE_DEF: ToolDefinition = {
  id: 'vestara.filesystem.read',
  name: 'Read File',
  description: 'Read the contents of a file at the specified path',
  version: '1.0.0',
  permissions: 'read-only',
  requires: ['filesystem'],
  timeout: 5000,
  sandbox: false,
  streaming: false,
  idempotent: true,
  destructive: false,
  category: 'filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
    },
    required: ['path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      path: { type: 'string' },
      size: { type: 'number' },
    },
  },
};

const WRITE_FILE_DEF: ToolDefinition = {
  id: 'vestara.filesystem.write',
  name: 'Write File',
  description: 'Write content to a file',
  version: '1.0.0',
  permissions: 'user-confirm',
  requires: ['filesystem'],
  timeout: 5000,
  sandbox: true,
  streaming: false,
  idempotent: false,
  destructive: true,
  category: 'filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      size: { type: 'number' },
    },
  },
};

function resolvePath(requestedPath: string): string {
  // Path traversal protection: reject paths with '..'
  if (requestedPath.includes('..')) {
    throw new Error('Path traversal detected: ".." not allowed');
  }
  // Resolve relative to current working directory
  const resolved = require('node:path').resolve(process.cwd(), requestedPath);
  return resolved;
}

export function createReadFileTool(): Tool {
  return {
    definition: READ_FILE_DEF,
    async execute(request: ActionRequest) {
      const path = request.parameters.path as string;
      try {
        const resolved = resolvePath(path);
        const fs = await import('node:fs');
        const content = fs.readFileSync(resolved, 'utf-8');
        return {
          success: true,
          data: { content, path: resolved, size: content.length },
          duration: 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Read failed',
          duration: 0,
        };
      }
    },
  };
}

export function createWriteFileTool(): Tool {
  return {
    definition: WRITE_FILE_DEF,
    async execute(request: ActionRequest) {
      const path = request.parameters.path as string;
      const content = request.parameters.content as string;
      try {
        const resolved = resolvePath(path);
        const fs = await import('node:fs');
        fs.writeFileSync(resolved, content, 'utf-8');
        return {
          success: true,
          data: { path: resolved, size: content.length },
          duration: 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Write failed',
          duration: 0,
        };
      }
    },
  };
}

export const filesystemToolDefinitions = [READ_FILE_DEF, WRITE_FILE_DEF];
