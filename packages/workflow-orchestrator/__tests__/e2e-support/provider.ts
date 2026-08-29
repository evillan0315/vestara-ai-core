/**
 * WFO-E2E scripted model provider.
 *
 * Implements the orchestrator TaskDispatcher from a predefined script. The
 * harness fails when an unexpected model call occurs: a call that does not match
 * the next scripted task, or any additional reasoning/dispatch turn.
 */

import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '../../src/types';

export interface ScriptedTaskResult {
  readonly taskSummary: string;
  readonly output?: string;
  readonly artifacts?: readonly Readonly<Record<string, unknown>>[];
}

export interface ScriptedReviewResult {
  readonly taskSummary?: string;
  readonly decision: 'approved' | 'changes-requested' | 'rejected';
  readonly feedback?: string;
}

export interface ScriptedModelScript {
  readonly tasks: readonly ScriptedTaskResult[];
  readonly reviews?: readonly ScriptedReviewResult[];
  readonly testsPassed?: boolean;
}

export interface ScriptedDispatchCall {
  readonly taskId: string;
  readonly taskSummary: string;
}

export class ScriptedModelProvider implements TaskDispatcher {
  private cursor = 0;
  readonly dispatchCalls: ScriptedDispatchCall[] = [];
  readonly unexpectedCalls: string[] = [];

  constructor(private readonly script: ScriptedModelScript) {}

  get calls(): number {
    return this.dispatchCalls.length;
  }

  async dispatch(task: WorkflowTask, _project: OrchestratedProject): Promise<TaskDispatchResult> {
    const expected = this.script.tasks[this.cursor];
    if (!expected || expected.taskSummary !== task.summary) {
      this.unexpectedCalls.push(task.summary);
      throw new Error(`unexpected model call for task "${task.summary}"`);
    }
    this.cursor += 1;
    this.dispatchCalls.push({ taskId: task.id, taskSummary: task.summary });
    return {
      status: 'completed',
      agentId: `scripted-${this.cursor}`,
      output: expected.output ?? `output for ${task.summary}`,
      artifacts: expected.artifacts,
    };
  }

  async review(
    task: WorkflowTask,
    _project: OrchestratedProject,
    _changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult> {
    const match = this.script.reviews?.find((review) => !review.taskSummary || review.taskSummary === task.summary);
    const review = match ?? { decision: 'approved' as const };
    return { decision: review.decision, agentId: 'scripted-reviewer', feedback: review.feedback };
  }

  async test(_task: WorkflowTask, _project: OrchestratedProject): Promise<TaskTestResult> {
    return {
      status: this.script.testsPassed === false ? 'failed' : 'passed',
      agentId: 'scripted-tester',
    };
  }
}
