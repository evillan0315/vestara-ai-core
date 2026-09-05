/**
 * @vestara/browser-runtime — Browser Task Runner (LB-011)
 *
 * Executes a `BrowserTask` (from @vestara/tools-browser) step by step through
 * the managed browser session. Each step transitions through
 * pending → running → completed/failed, emits normalized events via the
 * Browser Runtime, and produces a traceable result plus optional evidence.
 *
 * The runner enforces the OBSERVE → DECIDE → ACT → VERIFY invariant at the
 * execution level: actions that reference element refs require a prior
 * observation to resolve them (STALE_ELEMENT_REFERENCE otherwise).
 */

import type { EvidenceCollectionResult } from '@vestara/evidence';
import {
  type BrowserSession,
  type BrowserStep,
  type BrowserStepAction,
  type BrowserTask,
  completeStep,
  completeTask,
  failStep,
  failTask,
  isAbortError,
  startStep,
  startTask,
  summarizeTask,
} from '@vestara/tools-browser';
import type { BrowserEvidenceCollectionRequest } from './browser-evidence';
import { BrowserEvidenceCollector } from './browser-evidence';
import type { BrowserRuntimeService, ManagedBrowserSession } from './browser-runtime';

// ─── Step executor ──────────────────────────────────────────

/**
 * Executes a single browser step against the session.
 * Returns a normalized output record stored on the step.
 */
export type BrowserStepExecutor = (
  step: BrowserStep,
  session: BrowserSession,
  key: string,
  signal: AbortSignal,
) => Promise<Readonly<Record<string, unknown>>>;

function requireString(input: Readonly<Record<string, unknown>>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Step input requires non-empty string: ${field}`);
  return value;
}

function optionalString(input: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = input[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(input: Readonly<Record<string, unknown>>, field: string): number | undefined {
  const value = input[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(input: Readonly<Record<string, unknown>>, field: string): boolean | undefined {
  const value = input[field];
  return typeof value === 'boolean' ? value : undefined;
}

const DEFAULT_EXECUTORS: Record<BrowserStepAction, BrowserStepExecutor> = {
  async navigate(step, session, key, signal) {
    const result = await session.navigate(requireString(step.input, 'url'), key, signal);
    return { url: result.url, title: result.title };
  },

  async observe(step, session, key, signal) {
    const result = await session.observe(key, signal);
    return {
      observationId: result.observationId,
      elementCount: result.elements.length,
      url: result.url,
      title: result.title,
    };
  },

  async click(step, session, key, signal) {
    const observationId = optionalString(step.input, 'observationId');
    const ref = optionalString(step.input, 'ref');
    if (observationId && ref) {
      await session.clickRef(observationId, ref, key, signal);
      return { observationId, ref };
    }
    const selector = optionalString(step.input, 'selector');
    if (selector) {
      await session.click(selector, undefined, key, signal);
      return { selector };
    }
    const x = optionalNumber(step.input, 'x');
    const y = optionalNumber(step.input, 'y');
    if (x !== undefined && y !== undefined) {
      await session.click('body', { x, y }, key, signal);
      return { x, y };
    }
    throw new Error('click step requires observationId+ref, selector, or x/y coordinates');
  },

  async type(step, session, key, signal) {
    const text = requireString(step.input, 'text');
    const submit = optionalBoolean(step.input, 'submit') ?? false;
    const observationId = optionalString(step.input, 'observationId');
    const ref = optionalString(step.input, 'ref');
    if (observationId && ref) {
      await session.typeRef(observationId, ref, text, submit, key, signal);
      return { observationId, ref, text, submit };
    }
    const selector = optionalString(step.input, 'selector');
    if (selector) {
      await session.type(selector, text, submit, key, signal);
      return { selector, text, submit };
    }
    throw new Error('type step requires observationId+ref or selector');
  },

  async scroll(step, session, key, signal) {
    const direction = requireString(step.input, 'direction') as 'up' | 'down';
    if (direction !== 'up' && direction !== 'down') throw new Error('scroll direction must be up or down');
    const amount = optionalNumber(step.input, 'amount') ?? 500;
    await session.scroll(direction, amount, key, signal);
    return { direction, amount };
  },

  async wait(step, session, key, signal) {
    const result = await session.waitForNavigation(key, signal);
    return { url: result.url, title: result.title };
  },

  async back(step, session, key, signal) {
    const result = await session.back(key, signal);
    return { url: result.url, title: result.title };
  },

  async forward(step, session, key, signal) {
    const result = await session.forward(key, signal);
    return { url: result.url, title: result.title };
  },

  async reload(step, session, key, signal) {
    const result = await session.reload(key, signal);
    return { url: result.url, title: result.title };
  },

  async screenshot(step, session, key, signal) {
    const result = await session.screenshot(key, signal);
    return { url: result.url, width: result.width, height: result.height, size: result.bytes.byteLength };
  },

  async extract(step, session, key, signal) {
    const result = await session.snapshot(key, signal);
    return { url: result.url, title: result.title, text: result.text };
  },

  async custom() {
    throw new Error('custom step requires a custom executor registered with the runner');
  },

  async select() {
    throw new Error('select step is not implemented yet');
  },
};

// ─── Options ────────────────────────────────────────────────

export interface BrowserTaskRunnerOptions {
  /** The managed session the task executes against. */
  readonly session: ManagedBrowserSession;
  /** The runtime used for event emission and stats. */
  readonly runtime: BrowserRuntimeService;
  /** Evidence collector used when the task requests evidence. */
  readonly collector?: BrowserEvidenceCollector;
  /** Override or extend the default step executors. */
  readonly executors?: Partial<Record<BrowserStepAction, BrowserStepExecutor>>;
}

export interface BrowserTaskEvidenceRequest {
  readonly workspaceRoot: string;
  readonly includeScreenshot?: boolean;
  readonly maxTextChars?: number;
}

export interface BrowserTaskRunRequest {
  /** Optional signal to cancel the task mid-execution. */
  readonly signal?: AbortSignal;
  /** When provided, browser evidence is collected after the task. */
  readonly evidence?: BrowserTaskEvidenceRequest;
  /**
   * Live view streaming: capture the viewport after the task starts, after
   * every step (success or failure), and at task end, publishing
   * `browser.viewport.captured` events so the UI renders a live browser
   * surface while the task runs. Off by default — screenshots stay opt-in.
   */
  readonly liveView?: boolean;
}

export interface BrowserTaskRunResult {
  readonly task: BrowserTask;
  readonly summary: ReturnType<typeof summarizeTask>;
  readonly success: boolean;
  readonly cancelled: boolean;
  readonly evidence?: EvidenceCollectionResult;
}

// ─── Runner ─────────────────────────────────────────────────

/**
 * Executes a BrowserTask step by step through the managed session.
 * Emits events for every step and task transition, and optionally
 * collects evidence via the BrowserEvidenceCollector.
 */
export class BrowserTaskRunner {
  private readonly executors: Record<BrowserStepAction, BrowserStepExecutor>;
  private readonly collector: BrowserEvidenceCollector;

  constructor(private readonly options: BrowserTaskRunnerOptions) {
    this.executors = { ...DEFAULT_EXECUTORS, ...options.executors };
    this.collector = options.collector ?? new BrowserEvidenceCollector();
  }

  /**
   * Run a task to completion. The task object is mutated in place
   * (status, step statuses, timestamps) so callers retain the trace.
   */
  async run(task: BrowserTask, request: BrowserTaskRunRequest = {}): Promise<BrowserTaskRunResult> {
    const { session, runtime } = this.options;
    const key = session.id;
    const signal = request.signal ?? new AbortController().signal;
    let cancelled = false;

    startTask(task);
    runtime.recordTaskStarted(task.id, session.id, task.objective);
    if (request.liveView) await this.captureViewport();

    for (const step of task.steps) {
      if (signal.aborted) {
        cancelled = true;
        step.status = 'cancelled';
        runtime.recordStepFailed(session.id, task.id, step.id, step.index, 'Task cancelled');
        continue;
      }

      startStep(step);
      runtime.recordStepStarted(session.id, task.id, step.id, step.index, step.description);
      try {
        const executor = this.executors[step.action];
        const output = await executor(step, session.session, key, signal);
        completeStep(step, output);
        runtime.recordStepCompleted(session.id, task.id, step.id, step.index, step.description);
      } catch (error) {
        if (isAbortError(error) || (signal.aborted && !cancelled)) {
          cancelled = true;
          step.status = 'cancelled';
          runtime.recordStepFailed(session.id, task.id, step.id, step.index, 'Cancelled');
        } else {
          const message = error instanceof Error ? error.message : String(error);
          failStep(step, message);
          runtime.recordStepFailed(session.id, task.id, step.id, step.index, message);
        }
      }
      if (request.liveView) await this.captureViewport().catch(() => {});
    }

    let evidence: EvidenceCollectionResult | undefined;
    if (request.evidence) {
      evidence = await this.collectEvidence(task, request.evidence);
    }

    if (cancelled) {
      task.status = 'cancelled';
      task.completed_at = new Date().toISOString();
      runtime.recordTaskFailed(task.id, session.id, 'Task cancelled');
      return { task, summary: summarizeTask(task), success: false, cancelled: true, evidence };
    }

    if (task.steps.some((s) => s.status === 'failed')) {
      failTask(task, 'One or more steps failed');
      runtime.recordTaskFailed(task.id, session.id, 'One or more steps failed');
      return { task, summary: summarizeTask(task), success: false, cancelled: false, evidence };
    }

    completeTask(
      task,
      `Task completed: ${task.steps.filter((s) => s.status === 'completed').length}/${task.steps.length} steps`,
      session.session.lastKnownUrl(key),
    );
    runtime.recordTaskCompleted(task.id, session.id, summarizeTask(task));
    if (request.liveView) await this.captureViewport().catch(() => {});
    return { task, summary: summarizeTask(task), success: true, cancelled: false, evidence };
  }

  /** Capture the current viewport and publish it as a live-stream event. */
  private async captureViewport(): Promise<void> {
    const { session, runtime } = this.options;
    const shot = await session.session.screenshot(session.id);
    const dataUrl = `data:image/png;base64,${Buffer.from(shot.bytes).toString('base64')}`;
    runtime.recordViewportCaptured(session.id, shot.url, shot.width, shot.height, dataUrl);
  }

  private async collectEvidence(
    task: BrowserTask,
    request: BrowserTaskEvidenceRequest,
  ): Promise<EvidenceCollectionResult> {
    const requestBody: BrowserEvidenceCollectionRequest = {
      executionId: task.id,
      taskId: task.id,
      workspaceRoot: request.workspaceRoot,
      session: this.options.session,
      includeScreenshot: request.includeScreenshot,
      maxTextChars: request.maxTextChars,
    };
    return this.collector.collect(requestBody);
  }
}
