/**
 * ARX-015 M10: Projection Runtime
 *
 * Transforms durable M9 ActivityRecords into live projection state.
 * Reconstructable: given the same ordered M9 records, rebuilding
 * produces equivalent projection state.
 *
 * This is a projection layer — never an orchestration authority.
 */

import type { ActivityActor, MembershipState, WorkflowRunId, WorkflowTaskId, WorkState } from '@vestara/types';
import type { ActivityCursor, ActivityRecord } from './m9-types';
import type {
  ActivityRoomProjection,
  AttentionEntry,
  AttentionSeverity,
  ContextualCapabilities,
  ParticipantProjection,
  StreamImportance,
  StreamItem,
  StreamItemKind,
  WorkflowSummary,
} from './projection-types';

// ─── Configuration ──────────────────────────────────────────

/** Maximum muted items before aggregation kicks in. */
const MUTING_THRESHOLD = 5;

/** Maximum stream items in memory before backpressure. */
const MAX_STREAM_ITEMS = 500;

// ─── Projection Runtime ─────────────────────────────────────

/**
 * Live projection runtime. Rebuilds from M9 records and processes
 * new activities incrementally.
 */
export class ProjectionRuntime {
  private participants = new Map<string, ParticipantProjection>();
  private stream: StreamItem[] = [];
  private attention: AttentionEntry[] = [];
  private workflowSummaries = new Map<string, WorkflowSummary>();
  private cursor: ActivityCursor | null = null;
  private roomName = 'Activity Room';

  /**
   * Rebuild entire projection from M9 durable records.
   * Produces equivalent state given the same ordered records.
   */
  rebuild(records: readonly ActivityRecord[]): ActivityRoomProjection {
    // Reset state
    this.participants.clear();
    this.stream = [];
    this.attention = [];
    this.workflowSummaries.clear();
    this.cursor = null;

    // Process each record in order
    for (const record of records) {
      this.processRecord(record);
    }

    return this.getProjection();
  }

  /**
   * Process a new activity record (live update).
   */
  processRecord(record: ActivityRecord): void {
    // Update cursor
    this.cursor = {
      sequenceNumber: record.sequenceNumber,
      eventId: record.eventId,
      timestamp: record.timestamp,
    };

    // Update participants
    this.updateParticipantFromRecord(record);

    // Add stream item
    const streamItem = this.recordToStreamItem(record);
    this.stream.push(streamItem);

    // Backpressure: trim old muted items
    if (this.stream.length > MAX_STREAM_ITEMS) {
      this.stream = this.stream.slice(-MAX_STREAM_ITEMS);
    }

    // Update workflow summary
    this.updateWorkflowSummary(record);

    // Generate attention entries
    this.generateAttention(record);
  }

  /**
   * Get current projection state.
   */
  getProjection(): ActivityRoomProjection {
    const participants = [...this.participants.values()];

    // Aggregate muted items for cleaner presentation
    const aggregatedStream = this.aggregateMutedItems(this.stream);

    return {
      room: {
        roomId: 'default',
        name: this.roomName,
        cursor: this.cursor ?? { sequenceNumber: 0, eventId: '', timestamp: '' },
        rebuiltAt: new Date().toISOString(),
      },
      participants,
      stream: aggregatedStream,
      workflowSummary: this.getLatestWorkflowSummary(),
      attention: this.attention.filter((a) => !a.acknowledged),
      contextualCapabilities: this.buildContextualCapabilities(participants),
    };
  }

  // ─── Participant Management ───────────────────────────────

  private updateParticipantFromRecord(record: ActivityRecord): void {
    const actor = record.actor;
    const participantId = `${actor.type}-${actor.id}`;

    const existing = this.participants.get(participantId);

    const membership = this.deriveMembership(record);
    const workState = this.deriveWorkState(record);
    const assignment = this.deriveAssignment(record);

    // Extract model/role metadata from payload.data (set by AgentLifecycleBridge)
    const data = record.payload.data as Record<string, unknown> | undefined;
    const role = typeof data?.role === 'string' ? data.role : undefined;
    const modelId = typeof data?.modelId === 'string' ? data.modelId : undefined;
    const modelDisplayName = typeof data?.modelDisplayName === 'string' ? data.modelDisplayName : undefined;
    const providerId = typeof data?.providerId === 'string' ? data.providerId : undefined;
    const teamId = typeof data?.teamId === 'string' ? data.teamId : undefined;
    const teamName = typeof data?.teamName === 'string' ? data.teamName : undefined;

    if (existing) {
      // Update existing participant — preserve stable identity, update metadata
      this.participants.set(participantId, {
        ...existing,
        modelDisplayName: modelDisplayName ?? existing.modelDisplayName,
        role: role ?? existing.role,
        modelId: modelId ?? existing.modelId,
        providerId: providerId ?? existing.providerId,
        teamId: teamId ?? existing.teamId,
        teamName: teamName ?? existing.teamName,
        membership: membership ?? existing.membership,
        workState: workState ?? existing.workState,
        currentAssignment: assignment ?? existing.currentAssignment,
        lastActivityAt: record.timestamp,
      });
    } else {
      // New participant
      this.participants.set(participantId, {
        participantId,
        type: actor.type,
        displayName: actor.displayName,
        modelDisplayName,
        role,
        modelId,
        providerId,
        teamId,
        teamName,
        membership: membership ?? 'joined',
        presence: 'offline', // presence resolved independently
        workState: workState ?? 'available',
        currentAssignment: assignment,
        joinedAt: record.timestamp,
        lastActivityAt: record.timestamp,
      });
    }
  }

  private deriveMembership(record: ActivityRecord): MembershipState | undefined {
    if (record.type === 'human.message' && record.actor.type === 'human') {
      return 'joined';
    }
    if (record.type.startsWith('agent.')) {
      return 'joined';
    }
    return undefined;
  }

  private deriveWorkState(record: ActivityRecord): WorkState | undefined {
    switch (record.type) {
      case 'task.started':
      case 'agent.started':
        return 'working';
      case 'task.runnable':
        return record.actor.type === 'agent' ? 'available' : undefined;
      case 'task.completed':
      case 'agent.completed':
        return 'available';
      case 'task.failed':
      case 'agent.failed':
        return 'attention-required';
      case 'agent.waiting':
        return 'waiting';
      case 'workflow.failed':
        return record.actor.type === 'agent' ? 'blocked' : undefined;
      default:
        return undefined;
    }
  }

  private deriveAssignment(record: ActivityRecord): ParticipantProjection['currentAssignment'] | undefined {
    if (record.type === 'task.started' && record.taskId && record.workflowRunId) {
      return {
        workflowRunId: record.workflowRunId,
        taskId: record.taskId,
        taskTitle: record.payload.message,
      };
    }
    return undefined;
  }

  // ─── Stream Management ────────────────────────────────────

  private recordToStreamItem(record: ActivityRecord): StreamItem {
    const kind = this.classifyKind(record);
    const importance = this.classifyImportance(record, kind);
    const activityIdStr = String(record.activityId);

    const base: StreamItem = {
      streamItemId: `si-${activityIdStr}`,
      activityId: activityIdStr,
      sequenceNumber: record.sequenceNumber,
      kind,
      importance,
      actor: record.actor,
      content: record.payload.message ?? `${record.type}`,
      timestamp: record.timestamp,
      workflowRunId: record.workflowRunId,
      executionId: record.executionId,
      taskId: record.taskId,
    };

    // Carry interaction presentation data for kind === 'interaction'
    if (kind === 'interaction' && record.payload.data) {
      const data = record.payload.data as Record<string, unknown>;
      const interactionId = typeof data.interactionId === 'string' ? data.interactionId : undefined;
      if (interactionId) {
        const lifecycle = record.type === 'interaction.responded' ? ('responded' as const) : ('presented' as const);
        const choices = Array.isArray(data.choices)
          ? (data.choices as readonly { choiceId: string; label: string; description?: string }[])
          : undefined;
        const selectedChoiceId = typeof data.selectedChoiceId === 'string' ? data.selectedChoiceId : undefined;
        const respondingParticipantId = lifecycle === 'responded' ? record.actor.id : undefined;
        const respondingParticipantName = lifecycle === 'responded' ? record.actor.displayName : undefined;

        return {
          ...base,
          interaction: {
            interactionId,
            lifecycle,
            ...(choices ? { choices } : {}),
            ...(selectedChoiceId ? { selectedChoiceId } : {}),
            ...(respondingParticipantId ? { respondingParticipantId } : {}),
            ...(respondingParticipantName ? { respondingParticipantName } : {}),
          },
        };
      }
    }

    return base;
  }

  private classifyKind(record: ActivityRecord): StreamItemKind {
    switch (record.type) {
      case 'human.message':
        return 'conversation';
      case 'workflow.started':
      case 'workflow.completed':
      case 'task.started':
      case 'task.completed':
      case 'agent.assigned':
      case 'agent.completed':
        return 'activity';
      case 'agent.progress':
        return 'progress';
      case 'task.runnable':
        return 'log';
      case 'task.failed':
      case 'agent.failed':
      case 'workflow.failed':
        return 'diagnostic';
      case 'system.event':
        return record.payload.data ? 'evidence' : 'telemetry';
      case 'interaction.presented':
      case 'interaction.responded':
        return 'interaction';
      default:
        return 'log';
    }
  }

  private classifyImportance(record: ActivityRecord, kind: StreamItemKind): StreamImportance {
    // Human messages are always primary
    if (record.type === 'human.message') return 'primary';

    // Workflow lifecycle is primary
    if (record.type === 'workflow.started' || record.type === 'workflow.completed') return 'primary';
    if (record.type === 'workflow.failed') return 'primary';

    // Task lifecycle is secondary
    if (record.type === 'task.started' || record.type === 'task.completed') return 'secondary';
    if (record.type === 'task.failed') return 'secondary';

    // Agent assigned/completed is secondary
    if (record.type === 'agent.assigned' || record.type === 'agent.completed') return 'secondary';

    // Interaction: presented is primary (decision needed), responded is secondary
    if (record.type === 'interaction.presented') return 'primary';
    if (record.type === 'interaction.responded') return 'secondary';

    // Progress, logs, telemetry are muted
    if (kind === 'progress' || kind === 'log' || kind === 'telemetry') return 'muted';

    // Default to secondary
    return 'secondary';
  }

  private aggregateMutedItems(items: StreamItem[]): StreamItem[] {
    const result: StreamItem[] = [];
    let mutedBuffer: StreamItem[] = [];

    for (const item of items) {
      if (item.importance === 'muted') {
        mutedBuffer.push(item);
        if (mutedBuffer.length >= MUTING_THRESHOLD) {
          result.push(this.coalesceMuted(mutedBuffer));
          mutedBuffer = [];
        }
      } else {
        if (mutedBuffer.length > 0) {
          result.push(this.coalesceMuted(mutedBuffer));
          mutedBuffer = [];
        }
        result.push(item);
      }
    }

    // Flush remaining muted items
    if (mutedBuffer.length > 0) {
      result.push(this.coalesceMuted(mutedBuffer));
    }

    return result;
  }

  private coalesceMuted(items: StreamItem[]): StreamItem {
    if (items.length === 1) return items[0];

    const kindCounts = new Map<StreamItemKind, number>();
    for (const item of items) {
      kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);
    }

    const dominantKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const totalLogs = items.filter((i) => i.kind === 'log').length;
    const totalTools = items.filter((i) => i.kind === 'progress').length;
    const warnings = items.filter((i) => i.kind === 'diagnostic').length;

    const parts: string[] = [];
    if (totalLogs > 0) parts.push(`${totalLogs} logs`);
    if (totalTools > 0) parts.push(`${totalTools} tools`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);

    return {
      streamItemId: `si-agg-${items[0].sequenceNumber}-${items[items.length - 1].sequenceNumber}`,
      activityId: items[0].activityId,
      sequenceNumber: items[0].sequenceNumber,
      kind: dominantKind,
      importance: 'muted',
      actor: items[0].actor,
      content: `${items.length} activities`,
      timestamp: items[items.length - 1].timestamp,
      aggregated: {
        count: items.length,
        kind: dominantKind,
        summary: parts.join(' · ') || `${items.length} items`,
        referencedActivityIds: items.map((i) => i.activityId),
        sequenceRange: {
          first: items[0].sequenceNumber,
          last: items[items.length - 1].sequenceNumber,
        },
      },
    };
  }

  // ─── Workflow Summary ─────────────────────────────────────

  private updateWorkflowSummary(record: ActivityRecord): void {
    if (!record.workflowRunId) return;

    const existing = this.workflowSummaries.get(record.workflowRunId);

    const status = this.deriveWorkflowStatus(record);
    const taskUpdate = this.deriveTaskUpdate(record);

    if (existing) {
      this.workflowSummaries.set(record.workflowRunId, {
        ...existing,
        status: status ?? existing.status,
        taskCount: taskUpdate?.taskCount ?? existing.taskCount,
        completedTasks: taskUpdate?.completedTasks ?? existing.completedTasks,
        failedTasks: taskUpdate?.failedTasks ?? existing.failedTasks,
        currentTask: taskUpdate?.currentTask ?? existing.currentTask,
        lastActivityAt: record.timestamp,
      });
    } else {
      this.workflowSummaries.set(record.workflowRunId, {
        workflowRunId: record.workflowRunId,
        executionId: record.executionId,
        status: status ?? 'running',
        taskCount: taskUpdate?.taskCount ?? 0,
        completedTasks: taskUpdate?.completedTasks ?? 0,
        failedTasks: taskUpdate?.failedTasks ?? 0,
        currentTask: taskUpdate?.currentTask,
        startedAt: record.timestamp,
        lastActivityAt: record.timestamp,
      });
    }
  }

  private deriveWorkflowStatus(record: ActivityRecord): WorkflowSummary['status'] | undefined {
    switch (record.type) {
      case 'workflow.started':
        return 'running';
      case 'workflow.completed':
        return 'completed';
      case 'workflow.failed':
        return 'failed';
      case 'workflow.cancelled':
        return 'cancelled';
      default:
        return undefined;
    }
  }

  private deriveTaskUpdate(record: ActivityRecord): Partial<WorkflowSummary> | undefined {
    switch (record.type) {
      case 'task.started':
        return { currentTask: record.taskId };
      case 'task.completed':
        return { completedTasks: 1, currentTask: undefined };
      case 'task.failed':
        return { failedTasks: 1 };
      case 'task.runnable':
        return { taskCount: 1 };
      default:
        return undefined;
    }
  }

  private getLatestWorkflowSummary(): WorkflowSummary | undefined {
    const summaries = [...this.workflowSummaries.values()];
    if (summaries.length === 0) return undefined;
    return summaries.reduce((latest, s) => (s.lastActivityAt > latest.lastActivityAt ? s : latest));
  }

  // ─── Attention ────────────────────────────────────────────

  private generateAttention(record: ActivityRecord): void {
    const attention = this.deriveAttention(record);
    if (attention) {
      // Deduplicate: don't create duplicate attention for same task
      const existing = this.attention.find(
        (a) => a.taskId === attention.taskId && a.reason === attention.reason && !a.acknowledged,
      );
      if (!existing) {
        this.attention.push(attention);
      } else {
        // Always update to reflect latest failure details
        const idx = this.attention.indexOf(existing);
        this.attention[idx] = attention;
      }
    }

    // Auto-resolve attention when task completes
    if (record.type === 'task.completed' && record.taskId) {
      const toResolve = this.attention.find((a) => a.taskId === record.taskId && !a.acknowledged);
      if (toResolve) {
        const idx = this.attention.indexOf(toResolve);
        this.attention[idx] = { ...toResolve, acknowledged: true };
      }
    }
  }

  private deriveAttention(record: ActivityRecord): AttentionEntry | undefined {
    switch (record.type) {
      case 'task.failed':
        return {
          attentionId: `att-${String(record.activityId)}`,
          reason: 'task-failed',
          severity: 'high',
          message: record.payload.error?.message ?? `Task failed: ${record.payload.message ?? record.taskId}`,
          actor: record.actor,
          workflowRunId: record.workflowRunId,
          taskId: record.taskId,
          timestamp: record.timestamp,
          acknowledged: false,
        };
      case 'workflow.failed':
        return {
          attentionId: `att-${String(record.activityId)}`,
          reason: 'workflow-failed',
          severity: 'critical',
          message: record.payload.error?.message ?? 'Workflow failed',
          actor: record.actor,
          workflowRunId: record.workflowRunId,
          timestamp: record.timestamp,
          acknowledged: false,
        };
      case 'agent.waiting':
        return {
          attentionId: `att-${String(record.activityId)}`,
          reason: 'waiting-for-human',
          severity: 'medium',
          message: record.payload.message ?? 'Agent waiting for input',
          actor: record.actor,
          workflowRunId: record.workflowRunId,
          taskId: record.taskId,
          timestamp: record.timestamp,
          acknowledged: false,
        };
      case 'agent.failed':
        return {
          attentionId: `att-${String(record.activityId)}`,
          reason: 'attention-required',
          severity: 'high',
          message: record.payload.error?.message ?? 'Agent failed',
          actor: record.actor,
          workflowRunId: record.workflowRunId,
          taskId: record.taskId,
          timestamp: record.timestamp,
          acknowledged: false,
        };
      default:
        return undefined;
    }
  }

  private severityRank(s: AttentionSeverity): number {
    const ranks: Record<AttentionSeverity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return ranks[s];
  }

  // ─── Contextual Capabilities ──────────────────────────────

  private buildContextualCapabilities(participants: ParticipantProjection[]): ContextualCapabilities {
    return {
      mentionableParticipants: participants
        .filter((p) => p.membership === 'joined')
        .map((p) => ({
          participantId: p.participantId,
          displayName: p.displayName,
          type: p.type,
        })),
      availableCommands: [
        { command: '/status', description: 'Show current workflow status' },
        { command: '/retry', description: 'Retry failed task' },
      ],
      referenceableEntities: this.buildReferenceableEntities(),
    };
  }

  private buildReferenceableEntities(): ContextualCapabilities['referenceableEntities'] {
    const entities: Array<{ entityId: string; entityType: 'workflow' | 'task' | 'artifact'; displayName: string }> = [];

    for (const [id, summary] of this.workflowSummaries) {
      entities.push({
        entityId: id,
        entityType: 'workflow',
        displayName: `Workflow ${summary.status}`,
      });
    }

    return entities;
  }
}
