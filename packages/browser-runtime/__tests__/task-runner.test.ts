import type { EmitEvent, EventBus } from '@vestara/event-bus';
import {
  addBrowserStep,
  type BrowserDriver,
  type BrowserNavigationResult,
  type BrowserObserveResult,
  type BrowserPoint,
  type BrowserScreenshotResult,
  type BrowserSessionOptions,
  type BrowserSnapshotResult,
  createBrowserTask,
} from '@vestara/tools-browser';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_TASK_COMPLETED, BROWSER_TASK_STARTED, BrowserRuntimeService, BrowserTaskRunner } from '../src/index';

const BASE = 'http://app.local:5173';

function createTestEventBus(): EventBus & { events: EmitEvent[] } {
  const events: EmitEvent[] = [];
  return {
    events,
    async emit(event: EmitEvent) {
      events.push(event);
    },
    subscribe: vi.fn() as unknown as EventBus['subscribe'],
    once: vi.fn() as unknown as EventBus['once'],
    unsubscribeAll: vi.fn() as unknown as EventBus['unsubscribeAll'],
    getMetrics: () => ({
      totalEmitted: events.length,
      totalProcessed: 0,
      totalFailed: 0,
      avgLatency: 0,
      activeSubscribers: 0,
    }),
  };
}

class FakeBrowserDriver implements BrowserDriver {
  readonly id = 'fake';
  navigations: string[] = [];
  clickLog: Array<{ selector?: string; point?: BrowserPoint; ref?: string }> = [];
  typeLog: Array<{ ref?: string; selector?: string; text: string }> = [];
  scrollLog: string[] = [];
  backLog = 0;
  forwardLog = 0;
  reloadLog = 0;
  waitLog = 0;

  async navigate(url: string): Promise<BrowserNavigationResult> {
    this.navigations.push(url);
    return { url, title: 'Fake Page' };
  }

  async snapshot(): Promise<BrowserSnapshotResult> {
    return { url: BASE, title: 'Fake Page', text: 'hello world' };
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    return { url: BASE, width: 640, height: 480, bytes: new Uint8Array([1, 2, 3]) };
  }

  async observe(): Promise<BrowserObserveResult> {
    return {
      url: BASE,
      title: 'Fake Page',
      observationId: 'obs-driver',
      elements: [
        { ref: 'e1', role: 'button', name: 'Submit' },
        { ref: 'e2', role: 'textbox', name: 'Email' },
      ],
    };
  }

  async click(selector: string, point: BrowserPoint | undefined): Promise<void> {
    this.clickLog.push({ selector, point });
  }

  async clickRef(ref: string): Promise<void> {
    this.clickLog.push({ ref });
  }

  async type(selector: string, text: string): Promise<void> {
    this.typeLog.push({ selector, text });
  }

  async typeRef(ref: string, text: string): Promise<void> {
    this.typeLog.push({ ref, text });
  }

  async scroll(direction: 'up' | 'down'): Promise<void> {
    this.scrollLog.push(direction);
  }

  async back(): Promise<void> {
    this.backLog++;
  }

  async forward(): Promise<void> {
    this.forwardLog++;
  }

  async reload(): Promise<void> {
    this.reloadLog++;
  }

  async waitForNavigation(): Promise<BrowserNavigationResult> {
    this.waitLog++;
    return { url: BASE, title: 'Fake Page' };
  }

  async close(): Promise<void> {}
}

async function setup() {
  const eventBus = createTestEventBus();
  const runtime = new BrowserRuntimeService({
    workspaceId: 'ws-1',
    eventBus,
    driverFactory: () => new FakeBrowserDriver(),
  });
  await runtime.start();
  const session = runtime.createSession('agent-1', 'task-1', { baseUrl: BASE });
  return { eventBus, runtime, session, driver: session.session as unknown as { driver: FakeBrowserDriver } };
}

function buildTask(
  sessionId: string,
  actions: Array<{ description: string; action: string; input: Record<string, unknown> }>,
) {
  const task = createBrowserTask(sessionId, 'agent-1', 'Test task');
  const steps = actions.map((a, i) => ({
    ...addBrowserStep(task, a.description, a.action as never, a.input),
    index: i + 1,
  }));
  task.steps = steps;
  return task;
}

describe('BrowserTaskRunner (LB-011)', () => {
  it('runs navigate + observe steps to completion', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [
      { description: 'Navigate to dashboard', action: 'navigate', input: { url: '/dashboard' } },
      { description: 'Observe page', action: 'observe', input: {} },
    ]);

    const result = await runner.run(task);

    expect(result.success).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(task.status).toBe('completed');
    expect(task.steps.every((s) => s.status === 'completed')).toBe(true);
    expect(task.steps[0]?.output).toMatchObject({ url: `${BASE}/dashboard` });
    expect(task.steps[1]?.output).toMatchObject({ observationId: expect.any(String), elementCount: 2 });
    expect(task.completed_at).toBeDefined();
    expect(result.summary.steps_completed).toBe(2);
  });

  it('emits task and step lifecycle events', async () => {
    const { eventBus, runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [{ description: 'Navigate', action: 'navigate', input: { url: '/dashboard' } }]);

    await runner.run(task);

    const types = eventBus.events.map((e) => e.type);
    expect(types).toContain(BROWSER_TASK_STARTED);
    expect(types).toContain('browser.step.started');
    expect(types).toContain('browser.step.completed');
    expect(types).toContain(BROWSER_TASK_COMPLETED);
    expect(types).not.toContain('browser.task.failed');

    const started = eventBus.events.find((e) => e.type === BROWSER_TASK_STARTED);
    expect(started?.payload).toMatchObject({ taskId: task.id, sessionId: session.id, objective: 'Test task' });
  });

  it('marks the task failed when a step fails', async () => {
    const { eventBus, runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [
      { description: 'Bad navigate', action: 'navigate', input: { url: 'javascript:alert(1)' } },
    ]);

    const result = await runner.run(task);

    expect(result.success).toBe(false);
    expect(task.status).toBe('failed');
    expect(task.steps[0]?.status).toBe('failed');
    expect(task.steps[0]?.error).toMatch(/not allowed/);
    expect(eventBus.events.some((e) => e.type === 'browser.task.failed')).toBe(true);
    expect(eventBus.events.some((e) => e.type === 'browser.step.failed')).toBe(true);
  });

  it('cancels the task when the signal aborts', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const controller = new AbortController();
    const task = buildTask(session.id, [
      { description: 'Navigate', action: 'navigate', input: { url: '/dashboard' } },
      { description: 'Never reached', action: 'observe', input: {} },
    ]);
    // Abort before running — the second step should never execute
    controller.abort();

    const result = await runner.run(task, { signal: controller.signal });

    expect(result.cancelled).toBe(true);
    expect(task.status).toBe('cancelled');
    expect(task.steps[0]?.status).toBe('cancelled');
    expect(task.steps[1]?.status).toBe('cancelled');
  });

  it('executes click/type via observation refs', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [
      { description: 'Observe', action: 'observe', input: {} },
      { description: 'Click submit', action: 'click', input: { observationId: 'obs-1', ref: 'e1' } },
      { description: 'Type email', action: 'type', input: { observationId: 'obs-1', ref: 'e2', text: 'a@b.co' } },
    ]);

    const result = await runner.run(task);
    expect(result.success).toBe(true);
    expect(task.steps[1]?.status).toBe('completed');
    expect(task.steps[2]?.status).toBe('completed');
  });

  it('runs scroll/wait/back/forward/reload steps', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [
      { description: 'Scroll down', action: 'scroll', input: { direction: 'down' } },
      { description: 'Wait', action: 'wait', input: {} },
      { description: 'Back', action: 'back', input: {} },
      { description: 'Forward', action: 'forward', input: {} },
      { description: 'Reload', action: 'reload', input: {} },
    ]);

    const result = await runner.run(task);
    expect(result.success).toBe(true);
    expect(task.status).toBe('completed');
  });

  it('collects evidence when requested', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({ session, runtime });
    const task = buildTask(session.id, [{ description: 'Navigate', action: 'navigate', input: { url: '/dashboard' } }]);

    const result = await runner.run(task, {
      evidence: { workspaceRoot: '/repo', includeScreenshot: true },
    });

    expect(result.evidence).toBeDefined();
    expect(result.evidence!.items.length).toBeGreaterThan(0);
    expect(result.evidence!.items.some((i) => i.kind === 'screenshot')).toBe(true);
  });

  it('supports custom executors', async () => {
    const { runtime, session } = await setup();
    const runner = new BrowserTaskRunner({
      session,
      runtime,
      executors: {
        custom: async () => ({ customResult: 'done' }),
      },
    });
    const task = buildTask(session.id, [{ description: 'Custom op', action: 'custom', input: {} }]);

    const result = await runner.run(task);
    expect(result.success).toBe(true);
    expect(task.steps[0]?.output).toMatchObject({ customResult: 'done' });
  });
});
