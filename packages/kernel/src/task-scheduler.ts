import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cron: string;
  priority: TaskPriority;
  status: TaskStatus;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  errorCount: number;
}

export interface TaskExecution {
  taskId: string;
  startedAt: string;
  completedAt?: string;
  status: TaskStatus;
  error?: string;
}

export interface TaskScheduler {
  schedule(task: ScheduledTask, fn: () => Promise<void>): void;
  cancel(taskId: string): void;
  runOnce(taskId: string): Promise<TaskExecution>;
  getStatus(): ScheduledTask[];
  pause(): void;
  resume(): void;
}

function parseCron(cron: string): { intervalMs: number } | null {
  if (cron.startsWith('every-')) {
    const match = cron.match(/^every-(\d+)(s|m|h)$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000 };
      return { intervalMs: value * (multipliers[unit] ?? 1000) };
    }
  }
  return null;
}

export class DefaultTaskScheduler implements TaskScheduler {
  private tasks: Map<string, { task: ScheduledTask; fn: () => Promise<void> }> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private _paused = false;
  private eventBus: EventBus;
  private logger: Logger;

  constructor(opts: { eventBus: EventBus; logger: Logger }) {
    this.eventBus = opts.eventBus;
    this.logger = opts.logger.child({ component: 'task-scheduler' });
    this.logger.info('Task scheduler initialized');
  }

  schedule(task: ScheduledTask, fn: () => Promise<void>): void {
    if (this.tasks.has(task.id)) {
      this.logger.warn('Task already scheduled, skipping', { taskId: task.id });
      return;
    }

    this.tasks.set(task.id, { task: { ...task, status: 'pending' }, fn });

    const parsed = parseCron(task.cron);
    if (parsed) {
      const timer = setInterval(async () => {
        if (this._paused) return;
        await this.executeTask(task.id);
      }, parsed.intervalMs);
      this.timers.set(task.id, timer);
    }

    this.logger.info('Task scheduled', { taskId: task.id, cron: task.cron });
  }

  cancel(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(taskId);
    }
    this.tasks.delete(taskId);
    this.logger.info('Task cancelled', { taskId });
  }

  async runOnce(taskId: string): Promise<TaskExecution> {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return this.executeTask(taskId);
  }

  getStatus(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map((e) => ({ ...e.task }));
  }

  pause(): void {
    this._paused = true;
    this.logger.info('Scheduler paused');
  }

  resume(): void {
    this._paused = false;
    this.logger.info('Scheduler resumed');
  }

  private async executeTask(taskId: string): Promise<TaskExecution> {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const startedAt = new Date().toISOString();
    entry.task.status = 'running';
    entry.task.lastRun = startedAt;

    const execution: TaskExecution = { taskId, startedAt, status: 'running' };

    await this.eventBus.emit({
      type: 'scheduler:task.started',
      source: 'scheduler',
      payload: { taskId, name: entry.task.name },
    });

    try {
      await entry.fn();
      entry.task.status = 'completed';
      entry.task.runCount++;
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();

      await this.eventBus.emit({
        type: 'scheduler:task.completed',
        source: 'scheduler',
        payload: { taskId, name: entry.task.name },
      });
    } catch (error) {
      entry.task.status = 'failed';
      entry.task.errorCount++;
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Task execution failed', {
        taskId,
        errorMessage: execution.error,
      });

      await this.eventBus.emit({
        type: 'scheduler:task.failed',
        source: 'scheduler',
        payload: { taskId, name: entry.task.name, error: execution.error },
      });
    }

    return execution;
  }
}
