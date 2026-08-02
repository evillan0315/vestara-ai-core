import type { EngineeringTruthEvent } from '@vestara/engineering-event-store';
import type { ThreadReplay } from '@vestara/thread-runtime';
import {
  type ActivityItem,
  type ApprovalProjection,
  type CommandExecutionProjection,
  type StreamEnvelope,
  type TaskFileChange,
  TUI_PROTOCOL_VERSION,
  type TuiDomainEvent,
  type TuiTaskProjection,
  type VerificationProjection,
} from '@vestara/tui-protocol';

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const status = (event: EngineeringTruthEvent): ActivityItem['status'] =>
  event.type.includes('failed')
    ? 'failed'
    : event.type.includes('blocked')
      ? 'blocked'
      : event.type.includes('completed') || event.type.includes('result')
        ? 'completed'
        : 'active';

export function projectTask(input: {
  readonly replay: ThreadReplay;
  readonly events: readonly EngineeringTruthEvent[];
  readonly changes?: readonly TaskFileChange[];
  readonly branch?: string;
}): TuiTaskProjection {
  const latest = input.replay.turns.at(-1);
  const activity: ActivityItem[] = [];
  const executions: CommandExecutionProjection[] = [];
  const approvals = new Map<string, ApprovalProjection>();
  let verification: VerificationProjection | undefined;
  let activeAgentId: string | undefined;
  for (const event of input.events) {
    const payload = record(event.payload);
    activeAgentId = event.authority === 'agent' ? event.actorId : activeAgentId;
    activity.push({
      id: event.id,
      kind: event.type.includes('tool')
        ? 'tool'
        : event.type.includes('approval')
          ? 'approval'
          : event.type.includes('verification')
            ? 'verification'
            : event.type.includes('filesystem')
              ? 'filesystem'
              : 'system',
      label: labelFor(event.type, payload),
      detail: detailFor(payload),
      status: status(event),
      timestamp: event.at,
      agentId: event.actorId,
      evidenceIds: event.verificationRunId ? [event.verificationRunId] : [],
    });
    if (event.type === 'harness.tool-result') {
      const evidence = Array.isArray(payload.evidence) ? payload.evidence.map(record) : [];
      for (const artifact of evidence) {
        const metadata = record(artifact.metadata);
        if (metadata.command || metadata.executable)
          executions.push({
            id: String(artifact.id ?? event.id),
            command: String(
              metadata.command ??
                `${metadata.executable ?? ''} ${Array.isArray(metadata.args) ? metadata.args.join(' ') : ''}`.trim(),
            ),
            cwd: typeof metadata.cwd === 'string' ? metadata.cwd : undefined,
            status: payload.status === 'completed' ? 'completed' : 'failed',
            exitCode: typeof metadata.exitCode === 'number' ? metadata.exitCode : undefined,
            stdout: bounded(typeof metadata.stdout === 'string' ? metadata.stdout : undefined).value,
            stderr: bounded(typeof metadata.stderr === 'string' ? metadata.stderr : undefined).value,
            truncated:
              metadata.truncated === true ||
              bounded(typeof metadata.stdout === 'string' ? metadata.stdout : undefined).truncated ||
              bounded(typeof metadata.stderr === 'string' ? metadata.stderr : undefined).truncated,
            evidenceIds: [String(artifact.id ?? event.id)],
          });
      }
    }
    if (event.type === 'harness.approval-request') {
      const id = String(payload.approvalId ?? event.id);
      approvals.set(id, {
        id,
        tool: String(payload.toolName ?? 'tool'),
        risk: String(payload.risk ?? 'unknown'),
        reason: String(payload.reason ?? 'Approval required'),
        resources: Array.isArray(payload.affectedResources) ? payload.affectedResources.map(String) : [],
        status: 'pending',
      });
    }
    if (event.type === 'harness.approval-decision') {
      const id = String(payload.approvalId ?? '');
      const prior = approvals.get(id);
      if (prior) approvals.set(id, { ...prior, status: payload.approved === true ? 'approved' : 'denied' });
    }
    if (event.type === 'harness.verification-result')
      verification = {
        runId: event.verificationRunId ?? `verification-${event.turnId}`,
        status: String(payload.status ?? 'inconclusive'),
        confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
        checks: Array.isArray(payload.checks)
          ? payload.checks.map((check) => {
              const item = record(check);
              return {
                id: String(item.id ?? item.name),
                name: String(item.name ?? item.id),
                status: String(item.status ?? 'not-run'),
                summary: String(item.summary ?? ''),
              };
            })
          : [],
        uncoveredRisks: Array.isArray(payload.uncoveredRisks) ? payload.uncoveredRisks.map(String) : [],
        evidenceIds: Array.isArray(payload.evidence)
          ? payload.evidence.map((item) => String(record(item).id ?? '')).filter(Boolean)
          : [],
      };
  }
  return {
    schemaVersion: TUI_PROTOCOL_VERSION,
    sequence: input.events.at(-1)?.seq ?? 0,
    generatedAt: new Date().toISOString(),
    thread: {
      id: input.replay.thread.id,
      taskId: input.replay.thread.taskId,
      title: input.replay.thread.title,
      status: input.replay.thread.status,
      activeAgentId,
      environmentId: input.replay.thread.environmentId,
      branch: input.branch,
      phase: latest?.state ?? 'idle',
      changedFileCount: input.changes?.length ?? 0,
      verificationStatus: verification?.status,
      attentionRequired: [...approvals.values()].some((x) => x.status === 'pending') || latest?.state === 'blocked',
    },
    activity,
    changes: input.changes ?? [],
    executions,
    verification,
    approvals: [...approvals.values()],
  };
}

export function envelopes(events: readonly EngineeringTruthEvent[]): readonly StreamEnvelope[] {
  return events
    .filter((e) => !!e.threadId)
    .map((e) => ({
      schemaVersion: TUI_PROTOCOL_VERSION,
      eventId: e.id,
      sequence: e.seq,
      timestamp: e.at,
      threadId: e.threadId!,
      taskId: e.taskId,
      agentId: e.actorId,
      correlationId: e.correlationId,
      causationId: e.causationId,
      event: {
        type: 'activity.updated',
        activity: {
          id: e.id,
          kind: e.type.includes('tool') ? 'tool' : 'system',
          label: labelFor(e.type, record(e.payload)),
          detail: detailFor(record(e.payload)),
          status: status(e),
          timestamp: e.at,
          agentId: e.actorId,
          evidenceIds: e.verificationRunId ? [e.verificationRunId] : [],
        },
      } as TuiDomainEvent,
    }));
}
function labelFor(type: string, payload: Readonly<Record<string, unknown>>): string {
  return String(payload.summary ?? payload.toolName ?? payload.state ?? type.replaceAll('.', ' '));
}
function detailFor(payload: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of ['error', 'reason', 'content', 'path'])
    if (typeof payload[key] === 'string') return payload[key] as string;
  return undefined;
}

function bounded(value: string | undefined, limit = 64 * 1024): { value?: string; truncated: boolean } {
  if (value === undefined) return { truncated: false };
  if (value.length <= limit) return { value, truncated: false };
  return {
    value: `… ${value.length - limit} characters omitted from live projection\n${value.slice(-limit)}`,
    truncated: true,
  };
}
