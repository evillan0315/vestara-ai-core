import type { ActivityRecord, AgentMessageActivity, AgentMessageKind } from '../contracts';
import type { ActivityProjector } from '../projector';
import { type ActivitySourceEvent, resolveActivityActor, stringField, stringFieldOr } from '../source-event';

const SUPPORTED_TYPES = new Set([
  'harness.user-message',
  'harness.steering-message',
  'harness.agent-message',
  'harness.model-response',
  'harness.harness-run',
  'harness.turn.started',
  'harness.final-outcome',
  'harness.outcome.completed',
  'harness.outcome.failed',
  'harness.steer',
  'harness.model.completed',
  'harness.tool-call',
  'harness.tool-result',
  'harness.tool.started',
  'harness.tool.completed',
  'harness.tool.failed',
  'harness.approval-request',
  'harness.approval-decision',
  'harness.approval.requested',
  'harness.approval.resolved',
]);

const EXCLUDED_PREFIXES = [
  'harness.verification',
  'harness.revision',
  'harness.state.changed',
  'harness.stage.',
  'harness.thread.',
];

/** Projects agent messages, invocations, tool calls, and approval decisions. */
export class AgentMessageProjector implements ActivityProjector {
  readonly kind = 'agent-message' as const;

  supports(event: ActivitySourceEvent): boolean {
    if (!SUPPORTED_TYPES.has(event.type)) return false;
    return !EXCLUDED_PREFIXES.some((prefix) => event.type.startsWith(prefix));
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const payload = event.payload;
    const messageKind = kindFor(event.type);
    const record: AgentMessageActivity = {
      id: `activity:${event.id}:agent-message`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'agent-message',
      agentId: stringFieldOr(payload, 'agentId', event.actorId),
      threadId: event.threadId,
      turnId: event.turnId,
      messageKind,
      content: contentFor(event),
      toolName: stringField(payload, 'toolName'),
      risk: riskFor(payload),
      status: stringField(payload, 'status'),
      taskId: event.taskId,
      workflowId: event.workflowId,
      correlationId: event.correlationId,
      evidenceRefs: [],
    };
    return [record];
  }
}

function kindFor(type: string): AgentMessageKind {
  if (type === 'harness.tool-call' || type === 'harness.tool.started') return 'tool-call';
  if (type === 'harness.tool-result' || type === 'harness.tool.completed' || type === 'harness.tool.failed')
    return 'tool-result';
  if (type === 'harness.approval-request' || type === 'harness.approval.requested') return 'approval-request';
  if (type === 'harness.approval-decision' || type === 'harness.approval.resolved') return 'approval-decision';
  if (type === 'harness.model-response' || type === 'harness.model.completed') return 'model-response';
  if (type === 'harness.steer' || type === 'harness.steering-message') return 'steering';
  if (
    type === 'harness.harness-run' ||
    type === 'harness.turn.started' ||
    type === 'harness.final-outcome' ||
    type === 'harness.outcome.completed' ||
    type === 'harness.outcome.failed'
  )
    return 'invocation';
  return 'message';
}

function contentFor(event: ActivitySourceEvent): string {
  const payload = event.payload;
  const direct = stringField(payload, 'content');
  if (direct !== undefined) return direct;
  const message = stringField(payload, 'message');
  if (message !== undefined) return message;
  const toolName = stringField(payload, 'toolName');
  switch (event.type) {
    case 'harness.harness-run':
      return `Run ${stringFieldOr(payload, 'runId', 'started')}`;
    case 'harness.turn.started':
      return 'Turn started';
    case 'harness.final-outcome':
      return `Outcome: ${stringFieldOr(payload, 'state', 'completed')}`;
    case 'harness.outcome.completed':
      return 'Outcome: completed';
    case 'harness.outcome.failed':
      return stringFieldOr(payload, 'error', 'Outcome: failed');
    case 'harness.tool.started':
      return `Start ${toolName ?? 'tool'}`;
    case 'harness.tool.completed':
      return `Complete ${toolName ?? 'tool'}`;
    case 'harness.tool.failed':
      return stringFieldOr(payload, 'error', `Failed ${toolName ?? 'tool'}`);
    case 'harness.tool-call':
      return `Call ${toolName ?? 'tool'}`;
    case 'harness.tool-result':
      return stringFieldOr(payload, 'error', `Result ${toolName ?? 'tool'}`);
    case 'harness.approval-request':
    case 'harness.approval.requested':
      return stringFieldOr(payload, 'reason', 'Approval requested');
    case 'harness.approval-decision':
    case 'harness.approval.resolved':
      return `Approval ${stringFieldOr(payload, 'decision', 'resolved')}`;
    default:
      return event.type;
  }
}

function riskFor(payload: Readonly<Record<string, unknown>>): 'low' | 'medium' | 'high' | 'critical' | undefined {
  const risk = payload.risk;
  return risk === 'low' || risk === 'medium' || risk === 'high' || risk === 'critical' ? risk : undefined;
}
