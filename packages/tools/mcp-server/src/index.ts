#!/usr/bin/env node
/**
 * GA-TOOL-001 / GA-RUNTIME-005: Vestara Governed Editing MCP Server
 *
 * Exposes vestara.edit (structured patch) and vestara.write (full replacement)
 * as MCP tools, backed by FilesystemRuntime for resource-level authority.
 *
 * Protocol: JSON-RPC 2.0 over stdio (MCP 2024-11-05)
 *
 * Lifecycle: spawned by OpenCode as an MCP server subprocess.
 * Repository identity: via VESTARA_REPO environment variable.
 * Approval: via AssistantInteractionBroker (HTTP to Vestara API).
 */

import * as readline from 'node:readline';
import { FilesystemRuntime, type FsOperation } from '@vestara/filesystem-runtime';
import type { ToolCallRequest } from '@vestara/tool-runtime';
import { FilesystemEditTool, FilesystemWriteTool, RiskBasedToolPolicy, ToolRuntime } from '@vestara/tool-runtime';

// ── Configuration ──────────────────────────────────────────────────────────

// RepositoryBinding: the MCP execution root MUST originate from the
// authoritative RepositoryBinding.repositoryDir. process.cwd() is
// never an authority fallback. Missing/mismatched binding → fail closed.
const REPO_DIR = process.env.VESTARA_REPO;
if (!REPO_DIR) {
  process.stderr.write('FATAL: VESTARA_REPO not set — refusing to start without authoritative repository binding\n');
  process.exit(1);
}
const REPO_ROOT: string = REPO_DIR;
const API_BASE = process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001';
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── FilesystemRuntime + ToolRuntime instances ───────────────────────────────

const filesystemRuntime = new FilesystemRuntime({
  rootDir: REPO_ROOT,
  dryRun: false,
  // GA-TOOL-004: Policy engine requires approval for all mutations (write/update/create).
  // Read-only operations (read/list/search) are allowed without approval.
  policyEngine: {
    async evaluate(request: { action: string; resource: string; metadata?: Record<string, unknown> }) {
      const mutatingOps = ['write', 'update', 'create', 'delete', 'rename', 'copy'];
      if (mutatingOps.includes(request.action)) {
        return { effect: 'ask', reason: `Mutation requires approval: ${request.action} ${request.resource}` };
      }
      return { effect: 'allow' };
    },
  },
  onPendingApproval: (op: FsOperation) => {
    requestApproval(op).catch(() => {});
  },
});

// GA-TOOL-003: Route through ToolRuntime for policy evaluation.
// MCP must NOT call FilesystemRuntime directly — the ToolRuntime's
// RiskBasedToolPolicy is the authorization boundary.
const toolRuntime = new ToolRuntime(new RiskBasedToolPolicy());
toolRuntime.register(new FilesystemEditTool(filesystemRuntime));
toolRuntime.register(new FilesystemWriteTool(filesystemRuntime));

// ── Approval flow ──────────────────────────────────────────────────────────

async function requestApproval(op: FsOperation): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'mcp-server' }),
    });
    if (!res.ok) return;
    const { conversation } = (await res.json()) as { conversation: { id: string } };

    // Surface the permission request via the conversation's stream
    // The Vestara API will handle the approval UI
    const pending = filesystemRuntime.getPendingApprovals().find((a: FsOperation) => a.id === op.id);
    if (pending) {
      // Auto-approve after timeout (fail-safe: reject)
      setTimeout(() => {
        filesystemRuntime.reject(op.id);
      }, APPROVAL_TIMEOUT_MS);
    }
  } catch {
    // API unavailable — reject the operation (fail-safe)
    filesystemRuntime.reject(op.id);
  }
}

// ── Tool definitions ───────────────────────────────────────────────────────

const VESTARA_EDIT_TOOL = {
  name: 'vestara.edit',
  description:
    'Apply a structured patch to an existing file. Supports string replacement, line removal, and line insertion. Repository-confined with resource-level authorization.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: { type: 'string', description: 'Repository-relative file path' },
      patch: {
        type: 'object',
        properties: {
          replace: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                search: { type: 'string', description: 'String to find' },
                replace: { type: 'string', description: 'Replacement string' },
              },
              required: ['search', 'replace'],
            },
            description: 'String search-and-replace operations',
          },
          removeLines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                startLine: { type: 'number', description: 'Start line (1-indexed)' },
                endLine: { type: 'number', description: 'End line (1-indexed, inclusive)' },
              },
              required: ['startLine'],
            },
            description: 'Line ranges to remove',
          },
          insert: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                atLine: { type: 'number', description: 'Insert before this line (1-indexed)' },
                content: { type: 'string', description: 'Content to insert' },
              },
              required: ['atLine', 'content'],
            },
            description: 'Lines to insert',
          },
        },
      },
      reason: { type: 'string', description: 'Human-readable reason for the edit' },
      dryRun: { type: 'boolean', description: 'Preview without mutating (default: false)' },
    },
    required: ['file', 'patch'],
  },
};

const VESTARA_WRITE_TOOL = {
  name: 'vestara.write',
  description:
    'Write (replace) the entire content of a file. Repository-confined with resource-level authorization. Sensitive files (.env, credentials) are blocked.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: { type: 'string', description: 'Repository-relative file path' },
      content: { type: 'string', description: 'Complete file content to write' },
      reason: { type: 'string', description: 'Human-readable reason for the write' },
      dryRun: { type: 'boolean', description: 'Preview without mutating (default: false)' },
    },
    required: ['file', 'content'],
  },
};

// ── JSON-RPC handler ───────────────────────────────────────────────────────

let callCounter = 0;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'vestara-governed-tools',
            version: '0.1.0',
          },
        },
      };

    case 'notifications/initialized':
      // Client acknowledgment — no response needed
      return { jsonrpc: '2.0', id: req.id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: [VESTARA_EDIT_TOOL, VESTARA_WRITE_TOOL] },
      };

    case 'tools/call': {
      const { name, arguments: args } = req.params as { name: string; arguments: Record<string, unknown> };
      return await handleToolCall(name, args, req.id);
    }

    default:
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      };
  }
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  id: number | string,
): Promise<JsonRpcResponse> {
  try {
    // GA-TOOL-003: All tool calls route through ToolRuntime.invoke()
    // for policy evaluation. Direct FilesystemRuntime calls are forbidden.
    const toolName = name === 'vestara.edit' ? 'filesystem.edit' : name === 'vestara.write' ? 'filesystem.write' : name;

    const request: ToolCallRequest = {
      callId: `mcp-${Date.now()}-${++callCounter}` as unknown as import('@vestara/types').ToolCallId,
      toolName,
      input: args,
      agentId: 'mcp',
      taskId: 'mcp-turn',
      environment: {
        id: REPO_ROOT as unknown as import('@vestara/types').AgentEnvironmentId,
        kind: 'local',
        workspaceRoot: REPO_ROOT,
        networkPolicy: 'deny',
        filesystemPolicy: 'workspace-write',
        processPolicy: 'restricted',
      },
    };

    const result = await toolRuntime.invoke(request, AbortSignal.timeout(30_000));

    if (result.status === 'denied') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Denied: ${result.reason}` }],
          isError: true,
        },
      };
    }

    if (result.status === 'approval-required') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Approval required: ${result.reason}. Waiting for user decision...` }],
        },
      };
    }

    if (result.status === 'completed') {
      const output = result.output as
        | { path?: string; summary?: { added?: number; removed?: number }; size?: number }
        | undefined;
      const path = output?.path ?? args.file;
      const detail =
        toolName === 'filesystem.edit'
          ? `+${output?.summary?.added ?? 0}/-${output?.summary?.removed ?? 0} lines`
          : `${output?.size ?? 0} bytes`;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: `${toolName === 'filesystem.edit' ? 'Edited' : 'Wrote'} ${path}: ${detail}` },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Error: ${result.status}` }],
        isError: true,
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      },
    };
  }
}

// ── Stdio transport ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line) as JsonRpcRequest;
    const response = await handleRequest(req);
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch {
    // Malformed JSON — ignore
  }
});

rl.on('close', () => {
  process.exit(0);
});
