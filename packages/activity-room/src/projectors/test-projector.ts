import type { ActivityRecord, TestActivity } from '../contracts';
import type { ActivityProjector } from '../projector';
import { type ActivitySourceEvent, numberField, resolveActivityActor, stringField } from '../source-event';

interface CheckLike {
  readonly name?: unknown;
  readonly status?: unknown;
  readonly summary?: unknown;
}

const SUPPORTED_TYPES = new Set(['task.tests.decided', 'harness.verification-result']);

/** Projects test execution outcomes from decided-test and verification-check events. */
export class TestProjector implements ActivityProjector {
  readonly kind = 'test' as const;

  supports(event: ActivitySourceEvent): boolean {
    return SUPPORTED_TYPES.has(event.type);
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const payload = event.payload;
    const record: TestActivity =
      event.type === 'task.tests.decided'
        ? this.fromDecided(event)
        : this.fromVerificationChecks(
            event,
            Array.isArray(payload.checks) ? (payload.checks as readonly CheckLike[]) : [],
          );
    return [record];
  }

  private fromDecided(event: ActivitySourceEvent): TestActivity {
    const passed = event.payload.status === 'passed';
    const failed = event.payload.status === 'failed';
    return {
      id: `activity:${event.id}:test`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'test',
      taskId: event.taskId,
      command: 'tests',
      passed: passed ? 1 : 0,
      failed: failed ? 1 : 0,
      skipped: 0,
      failureFingerprints: failed ? ['task-tests-failed'] : [],
      workflowId: event.workflowId,
      correlationId: event.correlationId,
      evidenceRefs: [],
    };
  }

  private fromVerificationChecks(event: ActivitySourceEvent, checks: readonly CheckLike[]): TestActivity {
    const normalized = checks.filter(isCheckLike);
    const passed = normalized.filter((check) => check.status === 'passed').length;
    const failed = normalized.filter((check) => check.status === 'failed').length;
    const skipped = normalized.filter((check) => check.status === 'skipped').length;
    const failureFingerprints = normalized.filter((check) => check.status === 'failed').map((check) => check.name);
    return {
      id: `activity:${event.id}:test`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'test',
      taskId: event.taskId,
      command: 'verification',
      passed,
      failed,
      skipped,
      durationMs: numberField(event.payload, 'durationMs'),
      failureFingerprints,
      outputExcerpt: stringField(event.payload, 'outputExcerpt'),
      workflowId: event.workflowId,
      correlationId: event.correlationId,
      evidenceRefs: [],
    };
  }
}

function isCheckLike(
  check: CheckLike,
): check is { readonly name: string; readonly status: 'passed' | 'failed' | 'skipped' | 'blocked' } {
  return typeof check.name === 'string' && typeof check.status === 'string';
}
