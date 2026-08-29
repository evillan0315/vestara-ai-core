/**
 * WorkspaceToolProvider — AI tool definitions for all workspace operations.
 *
 * Wraps workspace runtime operations as LLM-callable tools.
 * Every tool is typed with input/output schemas and permission levels.
 */

import type { Tool } from '@vestara/action';
import type { PermissionLevel, ToolDefinition } from '@vestara/shared';
import type { FilesystemService } from './fs-service';
import type { GitService } from './git-service';
import type { WorkspaceIndex } from './workspace-index';

function def(
  id: string,
  name: string,
  description: string,
  permissions: PermissionLevel,
  inputSchema: Record<string, unknown>,
  outputSchema?: Record<string, unknown>,
  destructive: boolean = false,
): ToolDefinition {
  return {
    id,
    name,
    description,
    version: '1.0.0',
    permissions,
    requires: ['workspace'],
    timeout: 10000,
    sandbox: false,
    streaming: false,
    idempotent: !destructive,
    destructive,
    category: 'custom',
    inputSchema: {
      type: 'object',
      properties: inputSchema as any,
      required: Object.entries(inputSchema)
        .filter(([, v]) => (v as any).required)
        .map(([k]) => k),
    },
    outputSchema: { type: 'object', properties: (outputSchema ?? {}) as any },
  };
}

export class WorkspaceToolProvider {
  private fs: FilesystemService;
  private git: GitService;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: index is injected for future search-backed tools.
  private index: WorkspaceIndex;

  constructor(fs: FilesystemService, git: GitService, index: WorkspaceIndex) {
    this.fs = fs;
    this.git = git;
    this.index = index;
  }

  getAllTools(): Tool[] {
    return [
      this.pwdTool(),
      this.lsTool(),
      this.treeTool(),
      this.globTool(),
      this.searchTool(),
      this.existsTool(),
      this.statTool(),
      this.readFileTool(),
      this.writeFileTool(),
      this.renameTool(),
      this.copyTool(),
      this.moveTool(),
      this.deleteTool(),
      this.mkdirTool(),
      this.hashTool(),
      this.resolveTool(),
      this.gitStatusTool(),
      this.gitDiffTool(),
      this.gitBranchTool(),
      this.gitLogTool(),
      this.gitCheckoutTool(),
      this.gitBlameTool(),
    ];
  }

  private pwdTool(): Tool {
    return {
      definition: def(
        'workspace.pwd',
        'Current Directory',
        'Return the current workspace root directory path',
        'read-only',
        {},
        { path: { type: 'string' } },
      ),
      execute: async () => {
        const path = this.fs.pwd();
        return { success: true, data: { path }, duration: 0 };
      },
    };
  }

  private lsTool(): Tool {
    return {
      definition: def('workspace.ls', 'List Directory', 'List files and directories in a path', 'read-only', {
        path: { type: 'string', description: 'Directory path (relative to workspace root)' },
      }),
      execute: async (request) => {
        const dirPath = (request.parameters.path as string) ?? '.';
        const entries = this.fs.ls(dirPath);
        return { success: true, data: { entries, path: dirPath }, duration: 0 };
      },
    };
  }

  private treeTool(): Tool {
    return {
      definition: def('workspace.tree', 'Directory Tree', 'Show directory tree structure', 'read-only', {
        path: { type: 'string', description: 'Directory path' },
        depth: { type: 'number', description: 'Maximum depth (default: 2)' },
      }),
      execute: async (request) => {
        const dirPath = (request.parameters.path as string) ?? '.';
        const depth = (request.parameters.depth as number) ?? 2;
        const tree = this.fs.tree(dirPath, depth);
        return { success: true, data: { tree, path: dirPath, depth }, duration: 0 };
      },
    };
  }

  private globTool(): Tool {
    return {
      definition: def(
        'workspace.glob',
        'Glob Files',
        'Find files matching a glob pattern (e.g. **/*.ts, packages/*/package.json)',
        'read-only',
        {
          pattern: { type: 'string', description: 'Glob pattern to match' },
        },
      ),
      execute: async (request) => {
        const pattern = request.parameters.pattern as string;
        const files = this.fs.glob(pattern);
        return { success: true, data: { files, count: files.length, pattern }, duration: 0 };
      },
    };
  }

  private searchTool(): Tool {
    return {
      definition: def(
        'workspace.search',
        'Search Files',
        'Search for files by name in the workspace index',
        'read-only',
        {
          query: { type: 'string', description: 'Search query (file name or path)' },
          maxResults: { type: 'number', description: 'Maximum results (default: 50)' },
        },
      ),
      execute: async (request) => {
        const query = request.parameters.query as string;
        const maxResults = (request.parameters.maxResults as number) ?? 50;
        const results = this.fs.search(query, maxResults);
        return { success: true, data: { results, count: results.length, query }, duration: 0 };
      },
    };
  }

  private existsTool(): Tool {
    return {
      definition: def('workspace.exists', 'Check File Exists', 'Check if a file or directory exists', 'read-only', {
        path: { type: 'string', description: 'Path to check' },
      }),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const exists = this.fs.exists(filePath);
        return { success: true, data: { exists, path: filePath }, duration: 0 };
      },
    };
  }

  private statTool(): Tool {
    return {
      definition: def('workspace.stat', 'File Stats', 'Get detailed file or directory information', 'read-only', {
        path: { type: 'string', description: 'Path to stat' },
      }),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const info = this.fs.stat(filePath);
        return { success: true, data: info, duration: 0 };
      },
    };
  }

  private readFileTool(): Tool {
    return {
      definition: def(
        'workspace.readFile',
        'Read File',
        'Read the contents of a file',
        'read-only',
        {
          path: { type: 'string', description: 'File path to read' },
        },
        {
          content: { type: 'string' },
          path: { type: 'string' },
          size: { type: 'number' },
        },
      ),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const result = this.fs.readFile(filePath);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private writeFileTool(): Tool {
    return {
      definition: def(
        'workspace.writeFile',
        'Write File',
        'Write content to a file (creates parent directories if needed)',
        'user-confirm',
        {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        {
          path: { type: 'string' },
          size: { type: 'number' },
          wasCreated: { type: 'boolean' },
        },
        true,
      ),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const content = request.parameters.content as string;
        const result = this.fs.writeFile(filePath, content);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private renameTool(): Tool {
    return {
      definition: def(
        'workspace.rename',
        'Rename File',
        'Rename or move a file or directory',
        'user-confirm',
        {
          oldPath: { type: 'string', description: 'Current path' },
          newPath: { type: 'string', description: 'New path' },
        },
        { oldPath: { type: 'string' }, newPath: { type: 'string' } },
        true,
      ),
      execute: async (request) => {
        const oldPath = request.parameters.oldPath as string;
        const newPath = request.parameters.newPath as string;
        const result = this.fs.rename(oldPath, newPath);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private copyTool(): Tool {
    return {
      definition: def(
        'workspace.copy',
        'Copy File',
        'Copy a file or directory',
        'user-confirm',
        {
          source: { type: 'string', description: 'Source path' },
          destination: { type: 'string', description: 'Destination path' },
        },
        { source: { type: 'string' }, destination: { type: 'string' }, size: { type: 'number' } },
        false,
      ),
      execute: async (request) => {
        const source = request.parameters.source as string;
        const destination = request.parameters.destination as string;
        const result = this.fs.copy(source, destination);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private moveTool(): Tool {
    return {
      definition: def(
        'workspace.move',
        'Move File',
        'Move a file or directory to a new location',
        'user-confirm',
        {
          source: { type: 'string', description: 'Source path' },
          destination: { type: 'string', description: 'Destination path' },
        },
        { source: { type: 'string' }, destination: { type: 'string' } },
        true,
      ),
      execute: async (request) => {
        const source = request.parameters.source as string;
        const destination = request.parameters.destination as string;
        const result = this.fs.move(source, destination);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private deleteTool(): Tool {
    return {
      definition: def(
        'workspace.delete',
        'Delete File',
        'Delete a file or directory permanently',
        'admin-only',
        {
          path: { type: 'string', description: 'Path to delete' },
        },
        { path: { type: 'string' }, recovered: { type: 'number' } },
        true,
      ),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const result = this.fs.delete(filePath);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private mkdirTool(): Tool {
    return {
      definition: def(
        'workspace.mkdir',
        'Create Directory',
        'Create a directory (recursive by default)',
        'user-confirm',
        {
          path: { type: 'string', description: 'Directory path to create' },
        },
        { path: { type: 'string' }, existed: { type: 'boolean' } },
        false,
      ),
      execute: async (request) => {
        const dirPath = request.parameters.path as string;
        const result = this.fs.mkdir(dirPath);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private hashTool(): Tool {
    return {
      definition: def(
        'workspace.hash',
        'File Hash',
        'Compute MD5 and SHA256 hashes of a file',
        'read-only',
        {
          path: { type: 'string', description: 'File path to hash' },
        },
        { path: { type: 'string' }, md5: { type: 'string' }, sha256: { type: 'string' }, size: { type: 'number' } },
      ),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const result = this.fs.hash(filePath);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private resolveTool(): Tool {
    return {
      definition: def(
        'workspace.resolve',
        'Resolve Path',
        'Resolve a relative path to an absolute path',
        'read-only',
        {
          path: { type: 'string', description: 'Path to resolve' },
        },
        { resolved: { type: 'string' }, relative: { type: 'string' } },
      ),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const resolved = this.fs.resolve(filePath);
        const relative = this.fs.relative(resolved);
        return { success: true, data: { resolved, relative }, duration: 0 };
      },
    };
  }

  private gitStatusTool(): Tool {
    return {
      definition: def(
        'workspace.gitStatus',
        'Git Status',
        'Show current git status (branch, staged, unstaged, untracked changes)',
        'read-only',
        {},
      ),
      execute: async () => {
        const status = this.git.status();
        return { success: true, data: status ?? { error: 'Not a git repository' }, duration: 0 };
      },
    };
  }

  private gitDiffTool(): Tool {
    return {
      definition: def('workspace.gitDiff', 'Git Diff', 'Show git diff (staged or unstaged changes)', 'read-only', {
        staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
      }),
      execute: async (request) => {
        const staged = (request.parameters.staged as boolean) ?? false;
        const diff = this.git.diff(staged);
        return { success: true, data: { entries: diff, staged }, duration: 0 };
      },
    };
  }

  private gitBranchTool(): Tool {
    return {
      definition: def('workspace.gitBranch', 'Git Branch', 'Show current git branch name', 'read-only', {}),
      execute: async () => {
        const branch = this.git.branch();
        return { success: true, data: { branch: branch ?? null }, duration: 0 };
      },
    };
  }

  private gitLogTool(): Tool {
    return {
      definition: def('workspace.gitLog', 'Git Log', 'Show recent git commit history', 'read-only', {
        maxCount: { type: 'number', description: 'Maximum commits (default: 10)' },
        file: { type: 'string', description: 'Filter by file path' },
        branch: { type: 'string', description: 'Branch name (default: HEAD)' },
      }),
      execute: async (request) => {
        const maxCount = (request.parameters.maxCount as number) ?? 10;
        const file = request.parameters.file as string | undefined;
        const branch = request.parameters.branch as string | undefined;
        const commits = this.git.log({ maxCount, file, branch });
        return { success: true, data: { commits, count: commits.length }, duration: 0 };
      },
    };
  }

  private gitCheckoutTool(): Tool {
    return {
      definition: def(
        'workspace.gitCheckout',
        'Git Checkout',
        'Checkout a git branch or specific file from a branch',
        'admin-only',
        {
          ref: { type: 'string', description: 'Branch name, tag, or commit hash' },
          path: { type: 'string', description: 'Optional specific file path to checkout' },
        },
        { ref: { type: 'string' }, paths: { type: 'array' } },
        true,
      ),
      execute: async (request) => {
        const ref = request.parameters.ref as string;
        const path = request.parameters.path as string | undefined;
        const result = this.git.checkout(ref, path);
        return { success: true, data: result, duration: 0 };
      },
    };
  }

  private gitBlameTool(): Tool {
    return {
      definition: def('workspace.gitBlame', 'Git Blame', 'Show git blame information for a file', 'read-only', {
        path: { type: 'string', description: 'File path to blame' },
      }),
      execute: async (request) => {
        const filePath = request.parameters.path as string;
        const blame = this.git.blame(filePath);
        return { success: true, data: { entries: blame, file: filePath }, duration: 0 };
      },
    };
  }
}
