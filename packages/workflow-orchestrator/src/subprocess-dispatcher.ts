/**
 * SubprocessTaskDispatcher — a remote-worker `TaskDispatcher` that executes
 * each task in an isolated child process (PCS-025 §3.4, §12).
 *
 * The task request is sent over IPC to the package's subprocess worker entry,
 * which runs it through an executor module (`VESTARA_WORKER_EXECUTOR`) or a
 * scripted default. This makes the `remote` worker boundary real for the
 * subprocess case; a network transport would follow the same contract.
 */

import { type ChildProcess, fork } from 'node:child_process';
import * as path from 'node:path';
import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from './types';

export interface SubprocessTaskDispatcherOptions {
  /** Absolute path to the compiled worker entry (defaults to dist/workers/subprocess-worker.js). */
  readonly workerScript?: string;
  /** Absolute path to a module exporting `execute(request)`; optional. */
  readonly executorModule?: string;
  readonly timeoutMs?: number;
}

export class SubprocessTaskDispatcher implements TaskDispatcher {
  private readonly workerScript: string;
  private readonly executorModule?: string;
  private readonly timeoutMs: number;

  constructor(options: SubprocessTaskDispatcherOptions = {}) {
    this.workerScript = options.workerScript ?? path.join(__dirname, 'workers', 'subprocess-worker.js');
    this.executorModule = options.executorModule;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    try {
      const result = await this.runInChild({ kind: 'dispatch', task: { ...task }, projectId: project.id });
      return {
        status: result.status === 'failed' ? 'failed' : 'completed',
        output: typeof result.output === 'string' ? result.output : undefined,
        error: typeof result.error === 'string' ? result.error : undefined,
        agentId: typeof result.agentId === 'string' ? result.agentId : undefined,
      };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  async review(
    task: WorkflowTask,
    project: OrchestratedProject,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult> {
    try {
      const result = await this.runInChild({
        kind: 'review',
        task: { ...task },
        projectId: project.id,
        changesets: changesets.map((changeset) => ({ ...changeset })),
      });
      const decision =
        result.decision === 'rejected' || result.decision === 'changes-requested' ? result.decision : 'approved';
      return { decision, feedback: typeof result.feedback === 'string' ? result.feedback : undefined };
    } catch (error) {
      return { decision: 'rejected', feedback: error instanceof Error ? error.message : String(error) };
    }
  }

  async test(task: WorkflowTask, project: OrchestratedProject): Promise<TaskTestResult> {
    try {
      const result = await this.runInChild({ kind: 'test', task: { ...task }, projectId: project.id });
      return {
        status: result.status === 'failed' ? 'failed' : 'passed',
        report: typeof result.report === 'object' && result.report ? { ...result.report } : undefined,
      };
    } catch (error) {
      return { status: 'failed', report: { error: error instanceof Error ? error.message : String(error) } };
    }
  }

  private runInChild(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.executorModule) env.VESTARA_WORKER_EXECUTOR = this.executorModule;
      let child: ChildProcess;
      try {
        child = fork(this.workerScript, [], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env,
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Subprocess worker timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      timeout.unref();

      child.on('message', (message: { result?: Record<string, unknown>; error?: string }) => {
        clearTimeout(timeout);
        child.kill();
        if (message.error) reject(new Error(message.error));
        else resolve(message.result ?? { status: 'completed' });
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.send(request);
    });
  }
}
