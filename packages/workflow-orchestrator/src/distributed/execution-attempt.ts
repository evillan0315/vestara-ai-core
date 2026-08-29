/**
 * WFO-E2E-001D — execution attempt authority.
 *
 * Distributed systems receive delayed results after reassignment. Each dispatch
 * creates a TaskExecutionAttempt carrying a generation; only the currently
 * authoritative generation may publish the accepted task result. Output arriving
 * from an expired or superseded attempt is rejected — it can never overwrite an
 * accepted result.
 */

export type TaskAttemptStatus = 'assigned' | 'running' | 'completed' | 'failed' | 'expired' | 'superseded';

export interface TaskExecutionAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly workerNodeId: string;
  readonly leaseId: string;
  readonly generation: number;
  readonly status: TaskAttemptStatus;
}

type MutableAttempt = Omit<TaskExecutionAttempt, 'status'> & { status: TaskAttemptStatus };

/**
 * Result-acceptance outcome — kept separate from the attempt's own lifecycle
 * status. An attempt may remain `superseded` or `expired`; the submitted result
 * receives the acceptance outcome.
 */
export type ResultAcceptance = 'accepted' | 'duplicate' | 'rejected-late' | 'rejected-non-authoritative';

/**
 * In-memory per-cluster ledger of execution attempts. The current generation
 * per task is the only authority that may publish a result; beginning a new
 * attempt supersedes prior running attempts.
 */
export class ExecutionAttemptLedger {
  private readonly attemptsByTask = new Map<string, MutableAttempt[]>();
  private readonly currentGeneration = new Map<string, number>();
  private seq = 0;

  /** Begin a new attempt; any prior running/assigned attempt becomes superseded. */
  begin(taskId: string, workerNodeId: string, leaseId: string): TaskExecutionAttempt {
    const generation = (this.currentGeneration.get(taskId) ?? 0) + 1;
    this.currentGeneration.set(taskId, generation);
    const attempt: MutableAttempt = {
      attemptId: `attempt-${++this.seq}`,
      taskId,
      workerNodeId,
      leaseId,
      generation,
      status: 'running',
    };
    const attempts = this.attemptsByTask.get(taskId) ?? [];
    for (const prior of attempts) {
      if (prior.status === 'running' || prior.status === 'assigned') prior.status = 'superseded';
    }
    attempts.push(attempt);
    this.attemptsByTask.set(taskId, attempts);
    return { ...attempt };
  }

  /** True when the attempt is the current authoritative generation and still in flight. */
  isAuthoritative(attemptId: string): boolean {
    const attempt = this.find(attemptId);
    if (!attempt) return false;
    return (
      this.currentGeneration.get(attempt.taskId) === attempt.generation &&
      (attempt.status === 'running' || attempt.status === 'assigned')
    );
  }

  /**
   * Publish a result for an attempt. Only the current generation is accepted;
   * a result from a superseded attempt is rejected-late, a result from an
   * unknown attempt is rejected-non-authoritative, and a re-submission of an
   * already-accepted attempt is a duplicate. The attempt status stays separate
   * from the acceptance outcome.
   */
  accept(attemptId: string): ResultAcceptance {
    const attempt = this.find(attemptId);
    if (!attempt) return 'rejected-non-authoritative';
    if (this.currentGeneration.get(attempt.taskId) !== attempt.generation) {
      attempt.status = 'superseded';
      return 'rejected-late';
    }
    if (attempt.status === 'completed') return 'duplicate';
    attempt.status = 'completed';
    return 'accepted';
  }

  markFailed(attemptId: string): void {
    const attempt = this.find(attemptId);
    if (!attempt) return;
    if (this.currentGeneration.get(attempt.taskId) === attempt.generation && attempt.status === 'running') {
      attempt.status = 'failed';
    }
  }

  /** Expire all in-flight attempts for a task (lease recovery / node loss). */
  expire(taskId: string): void {
    for (const attempt of this.attemptsByTask.get(taskId) ?? []) {
      if (attempt.status === 'running' || attempt.status === 'assigned') attempt.status = 'expired';
    }
  }

  attempts(taskId: string): readonly TaskExecutionAttempt[] {
    return (this.attemptsByTask.get(taskId) ?? []).map((attempt) => ({ ...attempt }));
  }

  /** The attempt that published the accepted result, if any. */
  acceptedAttempt(taskId: string): TaskExecutionAttempt | undefined {
    return this.attempts(taskId).find((attempt) => attempt.status === 'completed');
  }

  private find(attemptId: string): MutableAttempt | undefined {
    for (const attempts of this.attemptsByTask.values()) {
      const match = attempts.find((attempt) => attempt.attemptId === attemptId);
      if (match) return match;
    }
    return undefined;
  }
}
