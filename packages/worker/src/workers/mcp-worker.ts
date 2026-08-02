import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { Job, JobResult } from '@vestara/job';
import type { WorkerConfig, WorkerDefinition } from '../index';
import { Worker } from '../index';

export interface MCPWorkerOptions {
  readonly timeoutMs?: number;
}

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

/**
 * Minimal MCP (Model Context Protocol) worker: spawns an MCP server subprocess
 * and speaks JSON-RPC over its stdio. Performs the `initialize` handshake and
 * calls a tool via `tools/call`. The server command comes from
 * `definition.labels.server` (e.g. `npx -y @modelcontextprotocol/server-git`),
 * and the tool name from `definition.labels.tool` (default `execute`).
 */
export class MCPWorker extends Worker {
  private readonly timeoutMs: number;

  constructor(
    config: Omit<WorkerConfig, 'definition'> & { definition: Omit<WorkerDefinition, 'workerType'> },
    options?: MCPWorkerOptions,
  ) {
    super({
      ...config,
      definition: { ...config.definition, workerType: 'mcp' },
    } as WorkerConfig);
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  protected async run(job: Job): Promise<JobResult> {
    const serverCommand = this.definition.labels?.server;
    if (!serverCommand) {
      return {
        status: 'failure',
        summary: 'MCP job requires a server via definition.labels.server',
      };
    }
    const tool = this.definition.labels?.tool ?? 'execute';

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(serverCommand, [], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      return {
        status: 'failure',
        summary: `Failed to spawn MCP server ${serverCommand}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const initialized = await this.handshake(child);
      if (!initialized) {
        return { status: 'failure', summary: 'MCP server initialize handshake failed' };
      }
      const result = await this.callTool(child, tool, {
        input: { jobType: job.type, jobId: job.id },
      });
      return {
        status: 'success',
        summary: `MCP tool ${tool} executed via ${serverCommand}`,
        output: (result as Record<string, unknown>) ?? {},
      };
    } catch (error) {
      return {
        status: 'failure',
        summary: `MCP execution failed via ${serverCommand}`,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      child.kill('SIGTERM');
    }
  }

  private async handshake(child: ChildProcessWithoutNullStreams): Promise<boolean> {
    try {
      const response = await this.request(child, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: '@vestara/worker', version: '0.1.0' },
      });
      return response !== undefined;
    } catch {
      return false;
    }
  }

  private async callTool(
    child: ChildProcessWithoutNullStreams,
    tool: string,
    arguments_: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(child, 'tools/call', { name: tool, arguments: arguments_ });
  }

  private request(
    child: ChildProcessWithoutNullStreams,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      let buffer = '';
      let settled = false;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`MCP request ${method} timed out`));
      }, this.timeoutMs);

      const onData = (chunk: Buffer): void => {
        buffer += chunk.toString('utf8');
        const messages = buffer.split('\n');
        buffer = messages.pop() ?? '';
        for (const line of messages) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as JsonRpcResponse;
            if (parsed.id !== id) continue;
            cleanup();
            if (parsed.error) {
              reject(new Error(`MCP ${method} error: ${parsed.error.message}`));
            } else {
              resolve(parsed.result);
            }
            return;
          } catch {
            // partial/ignored frame; keep buffering
          }
        }
      };

      const cleanup = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', () => {
        // consume stderr so the child does not block; errors surface via responses
      });
      child.once('close', () => {
        if (!settled) {
          cleanup();
          reject(new Error(`MCP server closed before responding to ${method}`));
        }
      });

      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error && !settled) {
          cleanup();
          reject(error);
        }
      });
    });
  }

  private requestId = 0;
}
