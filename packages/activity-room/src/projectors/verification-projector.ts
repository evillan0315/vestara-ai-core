import type { ActivityRecord, VerificationActivity, VerificationCheck, VerificationOutcome } from '../contracts';
import type { ActivityProjector } from '../projector';
import {
  type ActivitySourceEvent,
  extractEvidenceRefs,
  numberField,
  resolveActivityActor,
  stringField,
  stringFieldOr,
} from '../source-event';

interface CheckLike {
  readonly name?: unknown;
  readonly status?: unknown;
  readonly summary?: unknown;
}

const SUPPORTED_TYPES = new Set([
  'harness.verification.started',
  'harness.verification.completed',
  'harness.verification-result',
  'verification.passed',
  'verification.failed',
  'verification.awaiting-approval',
  'project.verification.reopened',
]);

const VERIFICATION_STATUS = new Set(['passed', 'failed', 'skipped', 'blocked']);

/** Projects verification lifecycle and conclusion events. */
export class VerificationProjector implements ActivityProjector {
  readonly kind = 'verification' as const;

  supports(event: ActivitySourceEvent): boolean {
    return SUPPORTED_TYPES.has(event.type);
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const payload = event.payload;
    const checks = Array.isArray(payload.checks)
      ? (payload.checks as readonly CheckLike[]).filter(isCheckLike).map(toVerificationCheck)
      : [];
    const record: VerificationActivity = {
      id: `activity:${event.id}:verification`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'verification',
      verificationRunId: event.verificationRunId,
      taskId: event.taskId,
      outcome: outcomeFor(event),
      confidence: numberField(payload, 'confidence'),
      checks,
      reason: reasonFor(event),
      workflowId: event.workflowId,
      correlationId: event.correlationId,
      evidenceRefs: extractEvidenceRefs(payload),
    };
    return [record];
  }
}

function outcomeFor(event: ActivitySourceEvent): VerificationOutcome {
  switch (event.type) {
    case 'verification.passed':
      return 'passed';
    case 'verification.failed':
      return 'failed';
    case 'verification.awaiting-approval':
      return 'blocked';
    case 'harness.verification.started':
    case 'project.verification.reopened':
      return 'inconclusive';
    default: {
      const status = stringFieldOr(event.payload, 'status', 'inconclusive');
      return status === 'passed' || status === 'failed' || status === 'blocked' ? status : 'inconclusive';
    }
  }
}

function reasonFor(event: ActivitySourceEvent): string | undefined {
  const reason = stringField(event.payload, 'reason');
  if (reason !== undefined) return reason;
  switch (event.type) {
    case 'harness.verification.started':
      return 'verification started';
    case 'harness.verification.completed':
      return 'verification completed';
    case 'verification.passed':
      return 'verification passed';
    case 'verification.failed':
      return 'verification failed';
    case 'verification.awaiting-approval':
      return 'verification awaiting approval';
    case 'project.verification.reopened':
      return 'verification reopened';
    default:
      return undefined;
  }
}

function isCheckLike(
  check: CheckLike,
): check is { readonly name: string; readonly status: string; readonly summary?: unknown } {
  return typeof check.name === 'string' && typeof check.status === 'string';
}

function toVerificationCheck(check: {
  readonly name: string;
  readonly status: string;
  readonly summary?: unknown;
}): VerificationCheck {
  return {
    name: check.name,
    status: VERIFICATION_STATUS.has(check.status) ? (check.status as VerificationCheck['status']) : 'blocked',
    summary: typeof check.summary === 'string' ? check.summary : undefined,
  };
}
