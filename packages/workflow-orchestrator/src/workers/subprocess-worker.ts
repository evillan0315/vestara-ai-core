/**
 * Subprocess worker entry — runs inside an isolated child process forked by
 * SubprocessTaskDispatcher.
 *
 * Receives a request over IPC and executes it through the executor module
 * referenced by `VESTARA_WORKER_EXECUTOR` (a module exporting `execute`), or
 * falls back to a scripted completion when no executor is configured. The
 * result (or error) is sent back over IPC before the child exits.
 */

import { pathToFileURL } from 'node:url';

interface WorkerRequest {
  readonly kind: 'dispatch' | 'review' | 'test';
  readonly task?: Record<string, unknown>;
  readonly projectId?: string;
  readonly changesets?: readonly Record<string, unknown>[];
}

interface WorkerExecutor {
  execute(request: WorkerRequest): Promise<Record<string, unknown>>;
}

function send(message: Record<string, unknown>): void {
  try {
    process.send?.(message);
  } catch {
    // parent gone
  }
}

if (process.send) {
  process.on('message', async (msg: WorkerRequest) => {
    const executorPath = process.env.VESTARA_WORKER_EXECUTOR;
    try {
      let result: Record<string, unknown>;
      if (executorPath) {
        const executor = (await import(pathToFileURL(executorPath).href)) as WorkerExecutor;
        result = await executor.execute(msg);
      } else {
        const kind = msg.kind ?? 'dispatch';
        const summary = String(msg.task?.summary ?? 'task');
        result = { status: 'completed', output: `worker:${kind}:${summary}` };
      }
      send({ result });
    } catch (error) {
      send({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      process.exit(0);
    }
  });
}
